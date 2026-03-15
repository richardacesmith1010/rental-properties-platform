import { NextResponse } from "next/server";
import {
  getDistributionMembersForAccount,
  planCustomDistributionTransfers,
  planEqualDistributionTransfers,
  recordPaymentDistribution
} from "@/lib/distributions";
import { formatCurrency } from "@/lib/format";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { sideEffectError } from "@/lib/logger";
import {
  createStripeTransfer,
  type StripeCheckoutSession,
  type StripePaymentIntent
} from "@/lib/stripe";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { getManagerStripeAccountForProperty, getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type Match = {
  column: "stripe_checkout_session_id" | "stripe_payment_intent_id";
  value: string;
};

interface Ctx {
  charge: { id: string; lease_id: string; status: string; due_date: string };
  lease: { id: string; tenant_profile_id: string | null; unit_id: string };
  unit: { id: string; property_id: string; unit_number: string };
  property: { id: string; owner_account_id: string | null };
  tenantProfile: { id: string; email: string | null } | null;
}

interface PaymentParams {
  supabase: AdminClient;
  chargeId: string;
  userId: string;
  amountCents: number;
  paymentMatch: Match;
  method: string;
  referenceNote: string | null;
  transferGroup: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  requireAuthorizedUser?: boolean;
  resetAutopay?: boolean;
  queueXp?: boolean;
}

function received(status?: string) {
  return NextResponse.json(status ? { received: true, status } : { received: true });
}

function isConstraintViolation(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "23514" ||
        error.message?.toLowerCase().includes("check constraint") === true)
  );
}

async function getCtx(supabase: AdminClient, chargeId: string): Promise<Ctx | null> {
  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, lease_id, status, due_date")
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge) {
    return null;
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (!lease) {
    return null;
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .eq("id", lease.unit_id)
    .maybeSingle();
  if (!unit) {
    return null;
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", unit.property_id)
    .maybeSingle();
  if (!property) {
    return null;
  }

  const { data: tenantProfile } = lease.tenant_profile_id
    ? await supabase
        .from("profiles")
        .select("id, email")
        .eq("id", lease.tenant_profile_id)
        .maybeSingle()
    : { data: null };

  return { charge, lease, unit, property, tenantProfile };
}

async function isAuthorizedUser(supabase: AdminClient, ctx: Ctx, userId: string) {
  const [{ data: ownerMembership }, { data: managerAssignment }] = await Promise.all([
    ctx.property.owner_account_id
      ? supabase
          .from("ownership_account_members")
          .select("account_id")
          .eq("account_id", ctx.property.owner_account_id)
          .eq("profile_id", userId)
          .eq("member_role", "owner")
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", ctx.property.id)
      .eq("manager_profile_id", userId)
      .eq("active", true)
      .maybeSingle()
  ]);

  return Boolean(ownerMembership?.account_id) || Boolean(managerAssignment?.property_id) || ctx.lease.tenant_profile_id === userId;
}

async function insertPaymentRecord(
  supabase: AdminClient,
  params: {
    chargeId: string;
    amountCents: number;
    method: string;
    referenceNote: string | null;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
  }
): Promise<"inserted" | "already_recorded"> {
  const buildPayload = (method: string, referenceNote: string | null) => ({
    rent_charge_id: params.chargeId,
    amount_cents: params.amountCents,
    method,
    reference_note: referenceNote,
    stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
    stripe_payment_intent_id: params.stripePaymentIntentId ?? null
  });

  let { error } = await supabase.from("payments").insert(buildPayload(params.method, params.referenceNote));
  if (!error) {
    return "inserted";
  }
  if (error.code === "23505") {
    return "already_recorded";
  }

  if (params.method === "autopay" && isConstraintViolation(error)) {
    ({ error } = await supabase
      .from("payments")
      .insert(buildPayload("card", params.referenceNote ? `${params.referenceNote} (stored as card)` : "Stripe Autopay (stored as card)")));
    if (!error) {
      return "inserted";
    }
    if (error.code === "23505") {
      return "already_recorded";
    }
  }

  throw error;
}

async function markChargePaid(supabase: AdminClient, chargeId: string) {
  const { error } = await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);
  if (error) {
    console.error("[stripe-webhook] markChargePaid:", error);
  }
}

async function updateAutopay(
  supabase: AdminClient,
  column: "id" | "lease_id",
  value: string,
  values: Record<string, number | string | boolean | null>
) {
  const { error } = await supabase.from("autopay_enrollments").update(values).eq(column, value);
  if (error) {
    console.error("[stripe-webhook] updateAutopay:", error);
  }
}

async function createTransfersForPayment(
  supabase: AdminClient,
  params: { propertyId: string; chargeId: string; amountCents: number; transferGroup: string; paymentMatch: Match }
) {
  try {
    const ownerStripeAccount = await getOwnerStripeAccountForProperty(params.propertyId);
    if (!ownerStripeAccount) {
      return;
    }

    const managerInfo = await getManagerStripeAccountForProperty(params.propertyId);
    const managementFee = managerInfo?.feeCents ?? 0;
    const ownerAmount = params.amountCents - managementFee;
    const paymentUpdate: Record<string, string | number> = { platform_fee_cents: 0 };
    let firstTransferId: string | null = null;

    if (ownerAmount > 0) {
      const { data: property } = await supabase
        .from("properties")
        .select("owner_account_id")
        .eq("id", params.propertyId)
        .maybeSingle();
      const ownerAccountId = property?.owner_account_id ?? null;
      let distributed = false;

      if (ownerAccountId) {
        const distribution = await getDistributionMembersForAccount(ownerAccountId);
        if (distribution.mode !== "retain" && distribution.members.length > 0) {
          const planned = distribution.mode === "split_equal"
            ? planEqualDistributionTransfers(ownerAmount, distribution.members)
            : planCustomDistributionTransfers(ownerAmount, distribution.members);

          if (planned.memberShares.length > 0) {
            const { data: payment } = await supabase
              .from("payments")
              .select("id")
              .eq(params.paymentMatch.column, params.paymentMatch.value)
              .maybeSingle();

            if (planned.llcFallbackAmount > 0) {
              const llcTransfer = await createStripeTransfer({
                amountCents: planned.llcFallbackAmount,
                destination: ownerStripeAccount,
                transferGroup: params.transferGroup,
                description: `LLC retained share for charge ${params.chargeId.slice(0, 8)}`
              });
              firstTransferId = llcTransfer.id;
            }

            for (const share of planned.memberShares) {
              try {
                const transfer = await createStripeTransfer({
                  amountCents: share.amountCents,
                  destination: share.destination,
                  transferGroup: params.transferGroup,
                  description: `Distribution for charge ${params.chargeId.slice(0, 8)}`
                });
                firstTransferId ??= transfer.id;
                await recordPaymentDistribution({
                  paymentId: payment?.id ?? null,
                  accountId: ownerAccountId,
                  profileId: share.profileId,
                  amountCents: share.amountCents,
                  distributionPct: share.distributionPct,
                  stripeTransferId: transfer.id,
                  status: "completed"
                });
              } catch (transferError) {
                console.error(`[stripe-webhook] Member transfer failed for ${share.profileId}:`, transferError);
                try {
                  const fallbackTransfer = await createStripeTransfer({
                    amountCents: share.amountCents,
                    destination: ownerStripeAccount,
                    transferGroup: params.transferGroup,
                    description: `LLC fallback share for charge ${params.chargeId.slice(0, 8)}`
                  });
                  firstTransferId ??= fallbackTransfer.id;
                } catch (fallbackError) {
                  console.error(`[stripe-webhook] LLC fallback transfer failed for ${share.profileId}:`, fallbackError);
                }
                await recordPaymentDistribution({
                  paymentId: payment?.id ?? null,
                  accountId: ownerAccountId,
                  profileId: share.profileId,
                  amountCents: share.amountCents,
                  distributionPct: share.distributionPct,
                  stripeTransferId: null,
                  status: "failed"
                });
              }
            }

            distributed = true;
          }
        }
      }

      if (!distributed) {
        const ownerTransfer = await createStripeTransfer({
          amountCents: ownerAmount,
          destination: ownerStripeAccount,
          transferGroup: params.transferGroup,
          description: `Rent payment for charge ${params.chargeId.slice(0, 8)}`
        });
        firstTransferId = ownerTransfer.id;
      }
    }

    if (firstTransferId) {
      paymentUpdate.stripe_transfer_id = firstTransferId;
    }
    if (managerInfo && managementFee > 0) {
      const managerTransfer = await createStripeTransfer({
        amountCents: managementFee,
        destination: managerInfo.accountId,
        transferGroup: params.transferGroup,
        description: `Management fee for charge ${params.chargeId.slice(0, 8)}`
      });
      paymentUpdate.manager_transfer_id = managerTransfer.id;
    }

    const { error } = await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq(params.paymentMatch.column, params.paymentMatch.value);
    if (error) {
      console.error("[stripe-webhook] update payment transfer metadata:", error);
    }
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  }
}

function queuePaymentNotifications(ctx: Ctx, amountCents: number) {
  void notifyOwnerMembersForProperty({
    propertyId: ctx.property.id,
    type: "payment_recorded",
    title: "Rent Payment Received",
    body: `A payment of ${formatCurrency(amountCents)} was recorded for Unit ${ctx.unit.unit_number}.`,
    entityType: "rent_charge",
    entityId: ctx.charge.id
  }).catch(sideEffectError("handlePaymentSucceeded", "notify_owner", {
    userId: ctx.tenantProfile?.id ?? "system",
    entityType: "rent_charge",
    entityId: ctx.charge.id
  }));

  if (ctx.tenantProfile?.id) {
    void createNotificationWithDelivery({
      recipientProfileId: ctx.tenantProfile.id,
      recipientEmail: ctx.tenantProfile.email,
      type: "payment_recorded",
      title: "Payment Received",
      body: `Your payment of ${formatCurrency(amountCents)} has been recorded. Thank you!`,
      entityType: "rent_charge",
      entityId: ctx.charge.id
    }).catch(sideEffectError("handlePaymentSucceeded", "notify_tenant", {
      userId: ctx.tenantProfile.id,
      entityType: "rent_charge",
      entityId: ctx.charge.id
    }));
  }
}

function queuePaymentXp(ctx: Ctx, userId: string, method: string) {
  const isOnTime = new Date().toISOString().slice(0, 10) <= ctx.charge.due_date;
  void awardXp(
    userId,
    isOnTime ? "rent_paid_on_time" : "rent_paid_late",
    isOnTime ? XP_VALUES.rent_paid_on_time : XP_VALUES.rent_paid_late,
    isOnTime ? "Rent payment recorded on time." : "Rent payment recorded after the due date.",
    { charge_id: ctx.charge.id, method }
  ).catch(sideEffectError("handlePaymentSucceeded", "award_xp", {
    userId,
    entityType: "xp_event",
    entityId: ctx.charge.id
  }));
}

function queueAutopayFailure(
  context: Ctx | null,
  tenantProfile: { id: string; email: string | null } | null,
  disabled: boolean
) {
  if (tenantProfile?.id) {
    void createNotificationWithDelivery({
      recipientProfileId: tenantProfile.id,
      recipientEmail: tenantProfile.email,
      type: "late_rent",
      title: disabled ? "Autopay Disabled" : "Autopay Payment Failed",
      body: disabled
        ? "Your automatic payment failed twice. Please update your payment method in Settings."
        : "We'll retry your payment in 3 days. Ensure your payment method is up to date.",
      entityType: "rent_charge",
      entityId: context?.charge.id
    }).catch(sideEffectError("handlePaymentFailed", "notify_tenant", {
      userId: tenantProfile.id,
      entityType: "rent_charge",
      entityId: context?.charge.id
    }));
  }

  if (context?.property.id) {
    void notifyOwnerMembersForProperty({
      propertyId: context.property.id,
      type: "late_rent",
      title: "Autopay Failed",
      body: `Automatic payment failed for Unit ${context.unit.unit_number}.`,
      entityType: "rent_charge",
      entityId: context.charge.id
    }).catch(sideEffectError("handlePaymentFailed", "notify_owner", {
      userId: tenantProfile?.id ?? "system",
      entityType: "rent_charge",
      entityId: context.charge.id
    }));
  }
}

async function recordPayment({
  supabase,
  chargeId,
  userId,
  amountCents,
  paymentMatch,
  method,
  referenceNote,
  transferGroup,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  requireAuthorizedUser = false,
  resetAutopay = false,
  queueXp = false
}: PaymentParams) {
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq(paymentMatch.column, paymentMatch.value)
    .maybeSingle();
  if (existingPayment) {
    return received("already_recorded");
  }

  const ctx = await getCtx(supabase, chargeId);
  if (!ctx || ctx.charge.status === "paid") {
    return received("charge_already_paid_or_missing");
  }
  if (requireAuthorizedUser && !(await isAuthorizedUser(supabase, ctx, userId))) {
    return NextResponse.json({ error: "Unauthorized user for this charge." }, { status: 403 });
  }

  try {
    const insertStatus = await insertPaymentRecord(supabase, {
      chargeId: ctx.charge.id,
      amountCents,
      method,
      referenceNote,
      stripeCheckoutSessionId,
      stripePaymentIntentId
    });
    if (insertStatus === "already_recorded") {
      return received("already_recorded");
    }
  } catch {
    return NextResponse.json(
      { error: method === "autopay" ? "Failed to record autopay payment." : "Failed to record payment." },
      { status: 500 }
    );
  }

  await markChargePaid(supabase, ctx.charge.id);
  if (resetAutopay) {
    const timestamp = new Date().toISOString();
    await updateAutopay(supabase, "lease_id", ctx.lease.id, {
      enabled: true,
      retry_count: 0,
      last_failed_at: null,
      updated_at: timestamp
    });
  }

  await createTransfersForPayment(supabase, {
    propertyId: ctx.property.id,
    chargeId: ctx.charge.id,
    amountCents,
    transferGroup,
    paymentMatch
  });

  queuePaymentNotifications(ctx, amountCents);
  if (queueXp) {
    queuePaymentXp(ctx, userId, method);
  }

  return received(method === "autopay" ? "autopay_payment_recorded" : "payment_recorded");
}

export async function handleAccountUpdated(
  supabase: AdminClient,
  account: { id?: string | null; charges_enabled?: boolean; payouts_enabled?: boolean }
) {
  const accountId = typeof account.id === "string" ? account.id : null;
  if (accountId && account.charges_enabled === true && account.payouts_enabled === true) {
    const [profileUpdate, ownershipUpdate] = await Promise.all([
      supabase.from("profiles").update({ stripe_onboarding_complete: true }).eq("stripe_account_id", accountId),
      supabase.from("ownership_accounts").update({ stripe_onboarding_complete: true }).eq("stripe_account_id", accountId)
    ]);
    if (profileUpdate.error) {
      console.error("profile Stripe onboarding update:", profileUpdate.error);
    }
    if (ownershipUpdate.error) {
      console.error("ownership Stripe onboarding update:", ownershipUpdate.error);
    }
  }

  return received();
}

export async function handlePaymentIntentSucceeded(supabase: AdminClient, paymentIntent: StripePaymentIntent) {
  const chargeId = paymentIntent.metadata?.charge_id;
  const userId = paymentIntent.metadata?.user_id;
  const amountCents = typeof paymentIntent.amount_received === "number"
    ? paymentIntent.amount_received
    : typeof paymentIntent.amount === "number"
      ? paymentIntent.amount
      : null;

  if (!chargeId || !userId || paymentIntent.metadata?.autopay !== "true" || !amountCents) {
    return received();
  }

  return recordPayment({
    supabase,
    chargeId,
    userId,
    amountCents,
    paymentMatch: { column: "stripe_payment_intent_id", value: paymentIntent.id },
    method: "autopay",
    referenceNote: "Stripe Autopay",
    transferGroup:
      typeof paymentIntent.transfer_group === "string" && paymentIntent.transfer_group.length > 0
        ? paymentIntent.transfer_group
        : `charge_${chargeId}`,
    stripePaymentIntentId: paymentIntent.id,
    resetAutopay: true,
    queueXp: true
  });
}

export async function handlePaymentIntentPaymentFailed(supabase: AdminClient, paymentIntent: StripePaymentIntent) {
  const chargeId = paymentIntent.metadata?.charge_id;
  const leaseId = paymentIntent.metadata?.lease_id;
  if (!chargeId || !leaseId || paymentIntent.metadata?.autopay !== "true") {
    return received();
  }

  const { data: enrollment } = await supabase
    .from("autopay_enrollments")
    .select("id, retry_count, tenant_profile_id")
    .eq("lease_id", leaseId)
    .eq("enabled", true)
    .maybeSingle();
  if (!enrollment) {
    return received();
  }

  const context = await getCtx(supabase, chargeId);
  const tenantProfile = enrollment.tenant_profile_id
    ? await supabase.from("profiles").select("id, email").eq("id", enrollment.tenant_profile_id).maybeSingle()
    : { data: null };
  const nextRetryCount = (enrollment.retry_count ?? 0) + 1;
  const failureTimestamp = new Date().toISOString();

  await updateAutopay(supabase, "id", enrollment.id, {
    enabled: nextRetryCount < 2,
    retry_count: nextRetryCount,
    last_failed_at: failureTimestamp,
    updated_at: failureTimestamp
  });
  queueAutopayFailure(context, tenantProfile.data, nextRetryCount >= 2);

  return received("autopay_failure_recorded");
}

export async function handleCheckoutSessionCompleted(supabase: AdminClient, session: StripeCheckoutSession) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;
  const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;

  if (!chargeId || !userId || session.payment_status !== "paid" || !amountCents) {
    return received();
  }

  return recordPayment({
    supabase,
    chargeId,
    userId,
    amountCents,
    paymentMatch: { column: "stripe_checkout_session_id", value: session.id },
    method: "card",
    referenceNote: "Stripe Checkout",
    transferGroup: `charge_${chargeId}`,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent ?? null,
    requireAuthorizedUser: true
  });
}
