"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import {
  calculateCardFee,
  getManagerFeeForProperty
} from "@/lib/payment-fees";
import { createStripeCheckoutSession } from "@/lib/stripe";
import {
  getManagerStripeAccountForProperty
} from "@/lib/stripe-connect";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createNotificationWithDelivery,
  notifyPropertyTeam
} from "@/lib/notifications";
import { tenantEligibleForEvent } from "@/lib/notification-policy";
import { logAudit } from "@/lib/audit";
import { formatCurrency, formatUnitLabel } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRetry } from "@/lib/retry";
import {
  parseFormData,
  recordManualPaymentSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import { deleteCharge } from "./charge-management";
import {
  PAYMENTS_UNAVAILABLE_MESSAGE,
  handleStripeCheckoutFailure,
  isCheckoutContext,
  isRetryableStripeError,
  prepareCheckoutContext
} from "@/lib/charge-checkout";

export async function payWithCard(formData: FormData): Promise<ActionState | void> {
  const checkoutContext = await prepareCheckoutContext(formData, "payWithCard");
  if (!isCheckoutContext(checkoutContext)) {
    return checkoutContext;
  }

  const { appUrl, charge, propertyId, ownerStripeAccount, userId } = checkoutContext;
  const { baseCents, feeCents: cardFeeCents, totalCents } = calculateCardFee(charge.amount_cents);

  let managerFee;
  try {
    managerFee = await getManagerFeeForProperty(propertyId, baseCents);
  } catch (error) {
    console.error("payWithCard manager fee error:", error);
    return { success: false, error: "Unable to calculate this payment right now." };
  }

  let managerStripeAccount = null;
  if (managerFee.feeCents > 0) {
    try {
      managerStripeAccount = await getManagerStripeAccountForProperty(propertyId, baseCents);
    } catch (error) {
      console.error("payWithCard manager stripe error:", error);
      return { success: false, error: "Unable to calculate this payment right now." };
    }
  }

  const managerOnboarded = managerStripeAccount !== null;
  const effectiveManagerFee = managerOnboarded ? managerFee.feeCents : 0;
  const applicationFeeAmountCents = cardFeeCents + effectiveManagerFee;

  let session;
  try {
    session = await withRetry(
      () =>
        createStripeCheckoutSession({
          amountCents: totalCents,
          metadata: {
            charge_id: charge.id,
            user_id: userId,
            payment_method: "card",
            transfer_mode: "destination",
            processing_fee_cents: String(cardFeeCents),
            base_amount_cents: String(baseCents),
            manager_fee_cents: String(effectiveManagerFee),
            manager_fee_full_cents: String(managerFee.feeCents)
          },
          successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${appUrl}/payments/cancel`,
          paymentMethodTypes: ["card"],
          transferDataDestination: ownerStripeAccount,
          applicationFeeAmountCents
        }),
      {
        maxAttempts: 2,
        baseDelayMs: 250,
        retryIf: isRetryableStripeError
      }
    );
  } catch (error) {
    return handleStripeCheckoutFailure({
      actionName: "payWithCard",
      error,
      userId,
      chargeId: charge.id,
      propertyId
    });
  }

  if (session.url) {
    redirect(session.url);
  }

  return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
}

export async function payWithACH(formData: FormData): Promise<ActionState | void> {
  const checkoutContext = await prepareCheckoutContext(formData, "payWithACH");
  if (!isCheckoutContext(checkoutContext)) {
    return checkoutContext;
  }

  const { appUrl, charge, propertyId, userId } = checkoutContext;
  const baseCents = charge.amount_cents;

  let managerFee;
  try {
    managerFee = await getManagerFeeForProperty(propertyId, baseCents);
  } catch (error) {
    console.error("payWithACH manager fee error:", error);
    return { success: false, error: "Unable to calculate this payment right now." };
  }

  let managerStripeAccount = null;
  if (managerFee.feeCents > 0) {
    try {
      managerStripeAccount = await getManagerStripeAccountForProperty(propertyId, baseCents);
    } catch (error) {
      console.error("payWithACH manager stripe error:", error);
      return { success: false, error: "Unable to calculate this payment right now." };
    }
  }

  const managerOnboarded = managerStripeAccount !== null;
  const effectiveManagerFee = managerOnboarded ? managerFee.feeCents : 0;

  let session;
  try {
    session = await withRetry(
      () =>
        createStripeCheckoutSession({
          amountCents: baseCents,
          metadata: {
            charge_id: charge.id,
            user_id: userId,
            payment_method: "ach",
            base_amount_cents: String(baseCents),
            manager_fee_cents: String(effectiveManagerFee),
            manager_fee_full_cents: String(managerFee.feeCents)
          },
          successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}&method=ach`,
          cancelUrl: `${appUrl}/payments/cancel`,
          transferGroup: `charge_${charge.id}`,
          paymentMethodTypes: ["us_bank_account"]
        }),
      {
        maxAttempts: 2,
        baseDelayMs: 250,
        retryIf: isRetryableStripeError
      }
    );
  } catch (error) {
    return handleStripeCheckoutFailure({
      actionName: "payWithACH",
      error,
      userId,
      chargeId: charge.id,
      propertyId
    });
  }

  if (session.url) {
    redirect(session.url);
  }

  return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
}

export async function payWithCardState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return (await payWithCard(formData)) ?? null;
}

export async function payWithACHState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return (await payWithACH(formData)) ?? null;
}

export async function deletePendingCharge(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return deleteCharge(_prev, formData);
}

export async function recordManualPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");

  const paymentRate = checkRateLimit(`manual-payment:${user.id}`, 20, 60 * 60 * 1000);
  if (!paymentRate.allowed) {
    return { success: false, error: "Too many payment attempts. Please try again later." };
  }

  // 2) Validate
  const parsed = parseFormData(recordManualPaymentSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { chargeId, amountDollars, method, referenceNote } = parsed.data;
  const amountCents = Math.round(amountDollars * 100);
  const paidAt = new Date().toISOString();
  if (amountCents <= 0) {
    return { success: false, error: "Amount must be greater than $0." };
  }

  const admin = createAdminClient();
  const chargeQuery = await withChargeEditingFallback(
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, status, amount_cents, deleted_at")
        .eq("id", chargeId)
        .is("deleted_at", null)
        .maybeSingle(),
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, status, amount_cents")
        .eq("id", chargeId)
        .maybeSingle()
  );
  if (chargeQuery.error) {
    return { success: false, error: "We couldn't find this rent. Refresh the page." };
  }
  const charge = chargeQuery.data;

  if (!charge) {
    return { success: false, error: "We couldn't find this rent. Refresh the page." };
  }

  if (charge.status === "paid") {
    return { success: false, error: "This payment is already marked paid." };
  }
  if (charge.status === "waived") {
    return { success: false, error: "This rent was cancelled by your landlord." };
  }

  if (amountCents !== charge.amount_cents) {
    return {
      success: false,
      error: "Enter the full amount owed."
    };
  }

  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id, collects_outside_domus")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (leaseError) console.error(`[notifications] manual_payment_lease: ${leaseError.code ?? "unknown"}`);
  if (leaseError || !lease) {
    return { success: false, error: "We couldn't find the lease for this rent." };
  }

  const { data: unit } = await admin
    .from("units")
    .select("id, property_id, unit_number")
    .eq("id", lease.unit_id)
    .maybeSingle();

  if (!unit) {
    return { success: false, error: "Unit not found for this lease." };
  }

  const canAdmin = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  // 5) Mutations
  const { error: paymentError } = await admin.from("payments").insert({
    rent_charge_id: charge.id,
    amount_cents: amountCents,
    method,
    reference_note: referenceNote || null,
    paid_at: paidAt
  });

  if (paymentError) {
    if (paymentError.code === "23505") {
      return { success: false, error: "Payment already recorded for this payment." };
    }
    return { success: false, error: "Failed to record manual payment." };
  }

  const { error: chargeUpdateError } = await admin
    .from("rent_charges")
    .update({ status: "paid" })
    .in("status", ["pending", "late"])
    .eq("id", charge.id);

  if (chargeUpdateError) {
    return { success: false, error: "Payment recorded, but failed to mark payment as paid." };
  }

  const { data: tenantProfile, error: tenantProfileError } = lease.tenant_profile_id
    ? await admin
        .from("profiles")
        .select("id, email")
        .eq("id", lease.tenant_profile_id)
        .maybeSingle()
    : { data: null, error: null };
  if (tenantProfileError) {
    console.error(`[notifications] manual_payment_tenant: ${tenantProfileError.code ?? "unknown"}`);
  }

  void notifyPropertyTeam({
    propertyId: unit.property_id,
    event: "rent_paid_manual",
    type: "payment_recorded",
    title: "Rent Payment Received",
    body: `A payment of ${formatCurrency(amountCents)} was recorded for ${formatUnitLabel(unit.unit_number)}.`,
    entityType: "rent_charge",
    entityId: charge.id,
    actorProfileId: user.id
  }).catch(
    sideEffectError("recordManualPayment", "notify_tenant", {
      userId: user.id,
      entityType: "rent_charge",
      entityId: charge.id
    })
  );

  if (!tenantProfileError && tenantProfile?.id &&
    tenantEligibleForEvent("rent_paid_manual", lease.collects_outside_domus)) {
    void createNotificationWithDelivery({
      recipientProfileId: tenantProfile.id,
      recipientEmail: tenantProfile.email,
      type: "payment_recorded",
      title: "Payment Received",
      body: `Your payment of ${formatCurrency(amountCents)} has been recorded. Thank you!`,
      entityType: "rent_charge",
      entityId: charge.id
    }).catch(
      sideEffectError("recordManualPayment", "notify_tenant", {
        userId: user.id,
        entityType: "rent_charge",
        entityId: charge.id
      })
    );
  }

  void logAudit({
    userId: user.id,
    action: "record_payment",
    entityType: "payment",
    entityId: charge.id,
    metadata: {
      propertyId: unit.property_id,
      unitNumber: unit.unit_number,
      tenantProfileId: lease.tenant_profile_id,
      amountCents,
      method
    }
  }).catch(
    sideEffectError("recordManualPayment", "log_audit", {
      userId: user.id,
      entityType: "rent_charge",
      entityId: charge.id
    })
  );

  // 6) Revalidate
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Manual payment recorded." };
}
