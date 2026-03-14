import { NextRequest, NextResponse } from "next/server";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { formatCurrency } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import {
  createStripeTransfer,
  type StripeCheckoutSession,
  type StripePaymentIntent,
  verifyWebhookSignature
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getManagerStripeAccountForProperty,
  getOwnerStripeAccountForProperty
} from "@/lib/stripe-connect";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";

interface ChargeContext {
  charge: {
    id: string;
    lease_id: string;
    status: string;
    due_date: string;
  };
  lease: {
    id: string;
    tenant_profile_id: string | null;
    unit_id: string;
  };
  unit: {
    id: string;
    property_id: string;
    unit_number: string;
  };
  property: {
    id: string;
    owner_account_id: string | null;
  };
  tenantProfile: {
    id: string;
    email: string | null;
  } | null;
}

function isConstraintViolation(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "23514" || error.message?.toLowerCase().includes("check constraint") === true;
}

async function getChargeContext(
  supabase: ReturnType<typeof createAdminClient>,
  chargeId: string
): Promise<ChargeContext | null> {
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

  return {
    charge,
    lease,
    unit,
    property,
    tenantProfile
  };
}

async function isAuthorizedCheckoutUser(
  supabase: ReturnType<typeof createAdminClient>,
  context: ChargeContext,
  userId: string
) {
  const [{ data: ownerMembership }, { data: managerAssignment }] = await Promise.all([
    context.property.owner_account_id
      ? supabase
          .from("ownership_account_members")
          .select("account_id")
          .eq("account_id", context.property.owner_account_id)
          .eq("profile_id", userId)
          .eq("member_role", "owner")
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", context.property.id)
      .eq("manager_profile_id", userId)
      .eq("active", true)
      .maybeSingle()
  ]);

  const isOwner = Boolean(ownerMembership?.account_id);
  const isManager = Boolean(managerAssignment?.property_id);
  const isTenant = context.lease.tenant_profile_id === userId;

  return isOwner || isManager || isTenant;
}

async function insertPaymentRecord(
  supabase: ReturnType<typeof createAdminClient>,
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

  let { error } = await supabase.from("payments").insert(
    buildPayload(params.method, params.referenceNote)
  );

  if (!error) {
    return "inserted";
  }

  if (error.code === "23505") {
    return "already_recorded";
  }

  if (params.method === "autopay" && isConstraintViolation(error)) {
    const fallbackReference = params.referenceNote
      ? `${params.referenceNote} (stored as card)`
      : "Stripe Autopay (stored as card)";

    ({ error } = await supabase.from("payments").insert(
      buildPayload("card", fallbackReference)
    ));

    if (!error) {
      return "inserted";
    }

    if (error.code === "23505") {
      return "already_recorded";
    }
  }

  throw error;
}

async function markChargePaid(
  supabase: ReturnType<typeof createAdminClient>,
  chargeId: string
) {
  await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);
}

async function createTransfersForPayment(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    propertyId: string;
    chargeId: string;
    amountCents: number;
    transferGroup: string;
    paymentMatch: { column: "stripe_checkout_session_id" | "stripe_payment_intent_id"; value: string };
  }
) {
  try {
    const ownerStripeAccount = await getOwnerStripeAccountForProperty(params.propertyId);
    if (!ownerStripeAccount) {
      return;
    }

    const managerInfo = await getManagerStripeAccountForProperty(params.propertyId);
    const managementFee = managerInfo?.feeCents ?? 0;
    const platformFee = 0;
    const ownerAmount = params.amountCents - managementFee - platformFee;
    const paymentUpdate: Record<string, string | number> = {
      platform_fee_cents: platformFee
    };

    if (ownerAmount > 0) {
      const ownerTransfer = await createStripeTransfer({
        amountCents: ownerAmount,
        destination: ownerStripeAccount,
        transferGroup: params.transferGroup,
        description: `Rent payment for charge ${params.chargeId.slice(0, 8)}`
      });
      paymentUpdate.stripe_transfer_id = ownerTransfer.id;
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

    await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq(params.paymentMatch.column, params.paymentMatch.value);
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  }
}

function queuePaymentNotifications(context: ChargeContext, amountCents: number) {
  void notifyOwnerMembersForProperty({
    propertyId: context.property.id,
    type: "payment_recorded",
    title: "Rent Payment Received",
    body: `A payment of ${formatCurrency(amountCents)} was recorded for Unit ${context.unit.unit_number}.`,
    entityType: "rent_charge",
    entityId: context.charge.id
  }).catch(
    sideEffectError("handlePaymentSucceeded", "notify_owner", {
      userId: context.tenantProfile?.id ?? "system",
      entityType: "rent_charge",
      entityId: context.charge.id
    })
  );

  if (context.tenantProfile?.id) {
    void createNotificationWithDelivery({
      recipientProfileId: context.tenantProfile.id,
      recipientEmail: context.tenantProfile.email,
      type: "payment_recorded",
      title: "Payment Received",
      body: `Your payment of ${formatCurrency(amountCents)} has been recorded. Thank you!`,
      entityType: "rent_charge",
      entityId: context.charge.id
    }).catch(
      sideEffectError("handlePaymentSucceeded", "notify_tenant", {
        userId: context.tenantProfile.id,
        entityType: "rent_charge",
        entityId: context.charge.id
      })
    );
  }
}

function queuePaymentXp(context: ChargeContext, userId: string, method: string) {
  const paidDateIso = new Date().toISOString().slice(0, 10);
  const isOnTime = paidDateIso <= context.charge.due_date;

  void awardXp(
    userId,
    isOnTime ? "rent_paid_on_time" : "rent_paid_late",
    isOnTime ? XP_VALUES.rent_paid_on_time : XP_VALUES.rent_paid_late,
    isOnTime ? "Rent payment recorded on time." : "Rent payment recorded after the due date.",
    {
      charge_id: context.charge.id,
      method
    }
  ).catch(
    sideEffectError("handlePaymentSucceeded", "award_xp", {
      userId,
      entityType: "xp_event",
      entityId: context.charge.id
    })
  );
}

function queueAutopayFailureNotifications(
  context: ChargeContext | null,
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
    }).catch(
      sideEffectError("handlePaymentFailed", "notify_tenant", {
        userId: tenantProfile.id,
        entityType: "rent_charge",
        entityId: context?.charge.id
      })
    );
  }

  if (context?.property.id) {
    void notifyOwnerMembersForProperty({
      propertyId: context.property.id,
      type: "late_rent",
      title: "Autopay Failed",
      body: `Automatic payment failed for Unit ${context.unit.unit_number}.`,
      entityType: "rent_charge",
      entityId: context.charge.id
    }).catch(
      sideEffectError("handlePaymentFailed", "notify_owner", {
        userId: tenantProfile?.id ?? "system",
        entityType: "rent_charge",
        entityId: context.charge.id
      })
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event;
  try {
    event = await verifyWebhookSignature(payload, signatureHeader);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Add `account.updated` to the Stripe webhook endpoint after deploying Connect.
  if (event.type === "account.updated") {
    const account = event.data.object;
    const accountId = typeof account.id === "string" ? account.id : null;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;

    if (accountId && chargesEnabled && payoutsEnabled) {
      await supabase
        .from("profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", accountId);
    }

    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as unknown as StripePaymentIntent;
    const chargeId = paymentIntent.metadata?.charge_id;
    const userId = paymentIntent.metadata?.user_id;
    const isAutopay = paymentIntent.metadata?.autopay === "true";
    const amountReceived =
      typeof paymentIntent.amount_received === "number"
        ? paymentIntent.amount_received
        : typeof paymentIntent.amount === "number"
          ? paymentIntent.amount
          : null;

    if (!chargeId || !userId || !isAutopay || !amountReceived) {
      return NextResponse.json({ received: true });
    }

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .maybeSingle();

    if (existingPayment) {
      return NextResponse.json({ received: true, status: "already_recorded" });
    }

    const context = await getChargeContext(supabase, chargeId);
    if (!context || context.charge.status === "paid") {
      return NextResponse.json({ received: true, status: "charge_already_paid_or_missing" });
    }

    try {
      const insertStatus = await insertPaymentRecord(supabase, {
        chargeId: context.charge.id,
        amountCents: amountReceived,
        method: "autopay",
        referenceNote: "Stripe Autopay",
        stripePaymentIntentId: paymentIntent.id
      });

      if (insertStatus === "already_recorded") {
        return NextResponse.json({ received: true, status: "already_recorded" });
      }
    } catch {
      return NextResponse.json({ error: "Failed to record autopay payment." }, { status: 500 });
    }

    await markChargePaid(supabase, context.charge.id);
    await supabase
      .from("autopay_enrollments")
      .update({
        enabled: true,
        retry_count: 0,
        last_failed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("lease_id", context.lease.id);

    await createTransfersForPayment(supabase, {
      propertyId: context.property.id,
      chargeId: context.charge.id,
      amountCents: amountReceived,
      transferGroup:
        typeof paymentIntent.transfer_group === "string" && paymentIntent.transfer_group.length > 0
          ? paymentIntent.transfer_group
          : `charge_${context.charge.id}`,
      paymentMatch: {
        column: "stripe_payment_intent_id",
        value: paymentIntent.id
      }
    });

    queuePaymentNotifications(context, amountReceived);
    queuePaymentXp(context, userId, "autopay");

    return NextResponse.json({ received: true, status: "autopay_payment_recorded" });
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as unknown as StripePaymentIntent;
    const chargeId = paymentIntent.metadata?.charge_id;
    const leaseId = paymentIntent.metadata?.lease_id;
    const isAutopay = paymentIntent.metadata?.autopay === "true";

    if (!chargeId || !leaseId || !isAutopay) {
      return NextResponse.json({ received: true });
    }

    const { data: enrollment } = await supabase
      .from("autopay_enrollments")
      .select("id, retry_count, tenant_profile_id")
      .eq("lease_id", leaseId)
      .eq("enabled", true)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ received: true });
    }

    const context = await getChargeContext(supabase, chargeId);
    const tenantProfile = enrollment.tenant_profile_id
      ? await supabase
          .from("profiles")
          .select("id, email")
          .eq("id", enrollment.tenant_profile_id)
          .maybeSingle()
      : { data: null };
    const nextRetryCount = (enrollment.retry_count ?? 0) + 1;
    const failureTimestamp = new Date().toISOString();

    if (nextRetryCount >= 2) {
      await supabase
        .from("autopay_enrollments")
        .update({
          enabled: false,
          retry_count: nextRetryCount,
          last_failed_at: failureTimestamp,
          updated_at: failureTimestamp
        })
        .eq("id", enrollment.id);

      queueAutopayFailureNotifications(context, tenantProfile.data, true);
    } else {
      await supabase
        .from("autopay_enrollments")
        .update({
          retry_count: nextRetryCount,
          last_failed_at: failureTimestamp,
          updated_at: failureTimestamp
        })
        .eq("id", enrollment.id);

      queueAutopayFailureNotifications(context, tenantProfile.data, false);
    }

    return NextResponse.json({ received: true, status: "autopay_failure_recorded" });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as unknown as StripeCheckoutSession;
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;

  if (!chargeId || !userId || session.payment_status !== "paid" || !amountTotal) {
    return NextResponse.json({ received: true });
  }

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingPayment) {
    return NextResponse.json({ received: true, status: "already_recorded" });
  }

  const context = await getChargeContext(supabase, chargeId);
  if (!context || context.charge.status === "paid") {
    return NextResponse.json({ received: true, status: "charge_already_paid_or_missing" });
  }

  if (!(await isAuthorizedCheckoutUser(supabase, context, userId))) {
    return NextResponse.json({ error: "Unauthorized user for this charge." }, { status: 403 });
  }

  try {
    const insertStatus = await insertPaymentRecord(supabase, {
      chargeId: context.charge.id,
      amountCents: amountTotal,
      method: "card",
      referenceNote: "Stripe Checkout",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent ?? null
    });

    if (insertStatus === "already_recorded") {
      return NextResponse.json({ received: true, status: "already_recorded" });
    }
  } catch {
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }

  await markChargePaid(supabase, context.charge.id);

  await createTransfersForPayment(supabase, {
    propertyId: context.property.id,
    chargeId: context.charge.id,
    amountCents: amountTotal,
    transferGroup: `charge_${chargeId}`,
    paymentMatch: {
      column: "stripe_checkout_session_id",
      value: session.id
    }
  });

  queuePaymentNotifications(context, amountTotal);

  return NextResponse.json({ received: true, status: "payment_recorded" });
}
