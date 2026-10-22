// Keep the inferred handler declarations byte-identical to HEAD.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NextResponse } from "next/server";
import { formatCurrency, formatUnitLabel } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import { createStripeTransferReversal, type StripeCheckoutSession, type StripePaymentIntent } from "@/lib/stripe";
import { createNotificationWithDelivery, notifyPropertyTeam } from "@/lib/notifications";
import { type AdminClient, getCtx, received } from "./stripe-webhook/context";
import { queueAutopayFailure } from "./stripe-webhook/notify";
import { recordPayment, updateAutopay } from "./stripe-webhook/payments";

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

  const contextResult = await getCtx(supabase, chargeId);
  const context = contextResult.ok ? contextResult.ctx : null;
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
  queueAutopayFailure(context, tenantProfile.data, nextRetryCount >= 2, paymentIntent.id);

  return received("autopay_failure_recorded");
}

export async function handleAsyncPaymentSucceeded(
  supabase: AdminClient,
  session: StripeCheckoutSession
) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;
  const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
  const managerFeeCents = session.metadata?.manager_fee_cents
    ? Number.parseInt(session.metadata.manager_fee_cents, 10)
    : null;

  if (!chargeId || !userId || !amountCents) {
    return received();
  }

  return recordPayment({
    supabase,
    chargeId,
    userId,
    amountCents,
    paymentMatch: { column: "stripe_checkout_session_id", value: session.id },
    method: "ach",
    referenceNote: "Stripe Checkout",
    transferGroup: `charge_${chargeId}`,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent ?? null,
    requireAuthorizedUser: true,
    transferMode: null,
    baseAmountCents: null,
    managerFeeCents
  });
}

export async function handleAsyncPaymentFailed(
  supabase: AdminClient,
  session: StripeCheckoutSession
) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;

  if (!chargeId || !userId) {
    return received();
  }

  console.error(
    `[stripe-webhook] ACH payment failed for charge ${chargeId}, user ${userId}, session ${session.id}`
  );

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("status")
    .eq("id", chargeId)
    .maybeSingle();

  if (charge?.status === "paid") {
    const { error } = await supabase
      .from("rent_charges")
      .update({ status: "pending" })
      .eq("id", chargeId)
      .in("status", ["paid"]);
    if (error) {
      console.error(`[stripe-webhook] Failed to revert charge ${chargeId}:`, error);
    } else {
      console.error(
        `[stripe-webhook] Reverted charge ${chargeId} from paid to pending after ACH failure`
      );
    }
  }

  const ctxResult = await getCtx(supabase, chargeId);
  if (ctxResult.ok) {
    const ctx = ctxResult.ctx;
    void notifyPropertyTeam({
      propertyId: ctx.property.id,
      event: "bank_payment_failed",
      type: "late_rent",
      title: "Bank payment didn't go through",
      body: `A bank payment for ${formatUnitLabel(ctx.unit.unit_number)} did not clear.`,
      entityType: "rent_charge",
      entityId: ctx.charge.id
    });
    if (ctx.tenantProfile?.id) {
      void createNotificationWithDelivery({
        recipientProfileId: ctx.tenantProfile.id,
        recipientEmail: ctx.tenantProfile.email,
        type: "late_rent",
        title: "Bank payment didn't go through",
        body: `Your bank account payment of ${formatCurrency(ctx.charge.amount_cents)} ` +
          `for ${formatUnitLabel(ctx.unit.unit_number)} didn't clear. ` +
          "Please try again or use a different payment method.",
        entityType: "rent_charge",
        entityId: ctx.charge.id,
        emailKey: `payment-failed-${session.payment_intent ?? session.id}`
      }).catch(sideEffectError("handleAsyncPaymentFailed", "notify_tenant", {
        userId: ctx.tenantProfile.id,
        entityType: "rent_charge",
        entityId: ctx.charge.id
      }));
    }
  } else if (ctxResult.reason === "db_error") {
    console.error(`[stripe-webhook] async_payment_failed: getCtx db_error for charge ${chargeId}`);
  }

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("id, stripe_transfer_id, manager_transfer_id, reversed_at")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (existingPaymentError) {
    console.error(
      `[stripe-webhook] RECONCILIATION: failed to load payment record for failed ACH session ${session.id}:`,
      existingPaymentError
    );
    return received("async_payment_failed");
  }

  if (existingPayment && !existingPayment.reversed_at) {
    console.error(
      `[stripe-webhook] RECONCILIATION: payment record ${existingPayment.id} ` +
        `exists for failed ACH session ${session.id} - reversing transfers`
    );

    if (existingPayment.stripe_transfer_id) {
      try {
        await createStripeTransferReversal({
          transferId: existingPayment.stripe_transfer_id,
          description: `Reversal: ACH payment failed for charge ${chargeId.slice(0, 8)}`,
          idempotencyKey: `reversal:owner:${existingPayment.id}`
        });
      } catch (error) {
        console.error(
          `[stripe-webhook] RECONCILIATION: failed to reverse owner transfer ${existingPayment.stripe_transfer_id}:`,
          error
        );
      }
    }

    if (existingPayment.manager_transfer_id) {
      try {
        await createStripeTransferReversal({
          transferId: existingPayment.manager_transfer_id,
          description: `Reversal: ACH payment failed for charge ${chargeId.slice(0, 8)}`,
          idempotencyKey: `reversal:manager:${existingPayment.id}`
        });
      } catch (error) {
        console.error(
          `[stripe-webhook] RECONCILIATION: failed to reverse manager transfer ${existingPayment.manager_transfer_id}:`,
          error
        );
      }
    }

    const { error: updateError } = await supabase
      .from("payments")
      .update({ reversed_at: new Date().toISOString() })
      .eq("id", existingPayment.id);
    if (updateError) {
      console.error(
        `[stripe-webhook] RECONCILIATION: failed to mark payment ${existingPayment.id} as reversed:`,
        updateError
      );
    }
  }

  return received("async_payment_failed");
}

export async function handleCheckoutSessionCompleted(supabase: AdminClient, session: StripeCheckoutSession) {
  const chargeId = session.metadata?.charge_id;
  const userId = session.metadata?.user_id;
  const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
  const transferMode = session.metadata?.transfer_mode ?? null;
  const method = session.metadata?.payment_method === "ach" ? "ach" : "card";
  const baseAmountCents = session.metadata?.base_amount_cents
    ? Number.parseInt(session.metadata.base_amount_cents, 10)
    : null;
  const managerFeeCents = session.metadata?.manager_fee_cents
    ? Number.parseInt(session.metadata.manager_fee_cents, 10)
    : null;

  if (!chargeId || !userId || session.payment_status !== "paid" || !amountCents) {
    if (session.payment_status !== "paid" && session.metadata?.payment_method === "ach") {
      console.log(
        `[stripe-webhook] ACH session ${session.id} completed with status '${session.payment_status}' — awaiting async confirmation`
      );
    }
    return received();
  }

  return recordPayment({
    supabase,
    chargeId,
    userId,
    amountCents,
    paymentMatch: { column: "stripe_checkout_session_id", value: session.id },
    method,
    referenceNote: "Stripe Checkout",
    transferGroup: `charge_${chargeId}`,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent ?? null,
    requireAuthorizedUser: true,
    transferMode,
    baseAmountCents,
    managerFeeCents
  });
}
