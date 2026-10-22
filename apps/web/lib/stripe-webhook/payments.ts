import "server-only";
import { createStripeTransfer } from "@/lib/stripe";
import { getManagerStripeAccountForProperty } from "@/lib/stripe-connect";
import {
  type AdminClient,
  type PaymentParams,
  getCtx,
  isAuthorizedUser,
  isConstraintViolation,
  received,
  retryableWebhookError
} from "./context";
import { notifyManagerOfFeeTransfer, queuePaymentNotifications } from "./notify";
import { createTransfersForPayment } from "./transfers";

export async function insertPaymentRecord(
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
    recorded_via: "stripe",
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

export async function markChargePaid(supabase: AdminClient, chargeId: string): Promise<boolean> {
  const { error, count } = await supabase
    .from("rent_charges")
    .update({ status: "paid" }, { count: "exact" })
    .eq("id", chargeId)
    .in("status", ["pending", "late"])
    .select("id");
  if (error) {
    console.error("[stripe-webhook] markChargePaid:", error);
    return false;
  }

  if (count === 0) {
    const { data: current, error: currentError } = await supabase
      .from("rent_charges")
      .select("status")
      .eq("id", chargeId)
      .maybeSingle();

    if (currentError) {
      console.error("[stripe-webhook] markChargePaid reread:", currentError);
      return false;
    }

    if (current?.status === "paid") {
      return true;
    }

    if (current?.status === "waived") {
      console.warn(`[stripe-webhook] markChargePaid: charge ${chargeId} was waived; proceeding`);
      return true;
    }

    console.error(
      `[stripe-webhook] markChargePaid: charge ${chargeId} in unexpected state '${current?.status ?? "missing"}'`
    );
    return false;
  }

  return true;
}

export async function updateAutopay(
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

export async function recordPayment({
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
  transferMode = null,
  baseAmountCents = null,
  managerFeeCents = null
}: PaymentParams) {
  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("id, reversed_at")
    .eq(paymentMatch.column, paymentMatch.value)
    .maybeSingle();
  if (existingPaymentError) return retryableWebhookError("db_error");
  if (existingPayment) {
    if (existingPayment.reversed_at) return received("already_recorded");
    const ctxResult = await getCtx(supabase, chargeId);
    if (!ctxResult.ok) {
      if (ctxResult.reason === "db_error") {
        console.error(`[stripe-webhook] CRITICAL: getCtx DB failure while repairing charge ${chargeId}`);
        return retryableWebhookError("db_error");
      }
      return received("already_recorded");
    }

    if (ctxResult.ctx.charge.status !== "paid") {
      const repaired = await markChargePaid(supabase, ctxResult.ctx.charge.id);
      if (!repaired) {
        return retryableWebhookError("charge_status_repair_failed");
      }
      console.log(`[stripe-webhook] Repaired charge ${chargeId} status to paid on retry`);
    }

    return received("already_recorded");
  }

  const ctxResult = await getCtx(supabase, chargeId);
  if (!ctxResult.ok) {
    if (ctxResult.reason === "db_error") {
      console.error(`[stripe-webhook] CRITICAL: getCtx DB failure for charge ${chargeId}`);
      return retryableWebhookError("db_error");
    }
    return received("charge_not_found");
  }

  const ctx = ctxResult.ctx;
  if (ctx.charge.status === "paid") {
    return received("charge_already_paid");
  }
  const parsedBase = typeof baseAmountCents === "number" && baseAmountCents > 0
    ? baseAmountCents
    : null;
  const recordedAmountCents = transferMode === "destination"
    ? (parsedBase ?? ctx.charge.amount_cents)
    : amountCents;

  if (recordedAmountCents > ctx.charge.amount_cents) {
    console.error(
      `[stripe-webhook] Payment amount (${recordedAmountCents}) exceeds charge amount (${ctx.charge.amount_cents}) for charge ${chargeId}`
    );
    return received("amount_exceeds_charge");
  }
  if (requireAuthorizedUser && !(await isAuthorizedUser(supabase, ctx, userId))) {
    console.error(`[stripe-webhook] Unauthorized user ${userId} for charge ${chargeId}`);
    return received("unauthorized_user");
  }

  try {
    const insertStatus = await insertPaymentRecord(supabase, {
      chargeId: ctx.charge.id,
      amountCents: recordedAmountCents,
      method,
      referenceNote,
      stripeCheckoutSessionId,
      stripePaymentIntentId
    });
    if (insertStatus === "already_recorded") {
      return received("already_recorded");
    }
  } catch (error) {
    console.error(
      `[stripe-webhook] Failed to record ${method === "autopay" ? "autopay" : "payment"} for charge ${chargeId}:`,
      error
    );
    return received(method === "autopay" ? "autopay_payment_record_failed" : "payment_record_failed");
  }

  const chargePaid = await markChargePaid(supabase, ctx.charge.id);
  if (!chargePaid) {
    console.error(`[stripe-webhook] CRITICAL: markChargePaid failed for charge ${ctx.charge.id}. Aborting transfers.`);
    return retryableWebhookError("charge_status_update_failed");
  }

  if (resetAutopay) {
    const timestamp = new Date().toISOString();
    await updateAutopay(supabase, "lease_id", ctx.lease.id, {
      enabled: true,
      retry_count: 0,
      last_failed_at: null,
      updated_at: timestamp
    });
  }

  if (transferMode !== "destination") {
    await createTransfersForPayment(supabase, {
      propertyId: ctx.property.id,
      chargeId: ctx.charge.id,
      amountCents: recordedAmountCents,
      transferGroup,
      paymentMatch,
      managerFeeCentsOverride: managerFeeCents
    });
  } else if (typeof managerFeeCents === "number" && Number.isFinite(managerFeeCents) && managerFeeCents > 0) {
    const { data: existingTransfer } = await supabase
      .from("payments")
      .select("manager_transfer_id")
      .eq(paymentMatch.column, paymentMatch.value)
      .maybeSingle();

    if (!existingTransfer?.manager_transfer_id) {
      const managerInfo = await getManagerStripeAccountForProperty(ctx.property.id, recordedAmountCents);
      if (managerInfo?.accountId) {
        try {
          const managerTransfer = await createStripeTransfer({
            amountCents: managerFeeCents,
            destination: managerInfo.accountId,
            description: `Management fee for charge ${ctx.charge.id.slice(0, 8)}`,
            idempotencyKey: `manager-transfer:${paymentMatch.column}:${paymentMatch.value}`
          });
          const { error: updateError } = await supabase
            .from("payments")
            .update({ manager_transfer_id: managerTransfer.id })
            .eq(paymentMatch.column, paymentMatch.value);
          if (updateError) {
            console.error("[stripe-webhook] update manager transfer metadata:", updateError);
          }
          notifyManagerOfFeeTransfer(supabase, {
            managerProfileId: managerInfo.managerProfileId,
            amountCents: managerFeeCents,
            chargeId: ctx.charge.id,
            managerPaymentId: managerTransfer.id
          });
        } catch (transferError) {
          console.error(
            `[stripe-webhook] Manager transfer failed for charge ${ctx.charge.id}:`,
            transferError
          );
        }
      }
    }
  }

  queuePaymentNotifications(ctx, recordedAmountCents);

  return received(method === "autopay" ? "autopay_payment_recorded" : "payment_recorded");
}
