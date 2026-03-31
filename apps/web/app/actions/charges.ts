"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { calculateCardFee, getManagerFeeForProperty } from "@/lib/payment-fees";
import { createStripeCheckoutSession } from "@/lib/stripe";
import {
  getManagerStripeAccountForProperty,
  getOwnerStripeAccountForProperty
} from "@/lib/stripe-connect";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { formatCurrency } from "@/lib/format";
import { isStripeConfigured } from "@/lib/env";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRetry } from "@/lib/retry";
import {
  payChargeSchema,
  parseFormData,
  recordManualPaymentSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import { deleteCharge } from "./charge-management";

const PAYMENTS_UNAVAILABLE_MESSAGE =
  "Payment processing is temporarily unavailable. Please try again later.";

function isRetryableStripeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed|network|timeout|timed out|ecconn|socket/i.test(message) ||
    /Stripe .* failed: 5\d\d/i.test(message)
  );
}

type CheckoutContext = {
  appUrl: string;
  charge: { id: string; amount_cents: number; status: string; lease_id: string };
  propertyId: string;
  ownerStripeAccount: string;
  userId: string;
};

function isCheckoutContext(value: ActionState | CheckoutContext): value is CheckoutContext {
  return Boolean(value && "charge" in value);
}

async function prepareCheckoutContext(
  formData: FormData,
  actionName: "payWithCard" | "payWithACH"
): Promise<ActionState | CheckoutContext> {
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`${actionName}:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(payChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { chargeId } = parsed.data;
  const chargeQuery = await withChargeEditingFallback(
    () =>
      supabase
        .from("rent_charges")
        .select("id, amount_cents, status, lease_id, deleted_at")
        .eq("id", chargeId)
        .is("deleted_at", null)
        .single(),
    () =>
      supabase
        .from("rent_charges")
        .select("id, amount_cents, status, lease_id")
        .eq("id", chargeId)
        .single()
  );
  if (chargeQuery.error) {
    return { success: false, error: "Unable to load this charge right now." };
  }
  const charge = chargeQuery.data;

  if (!charge) {
    return { success: false, error: "Charge not found." };
  }
  if (charge.status === "paid") {
    return { success: false, error: "This charge has already been paid." };
  }
  if (charge.status === "waived") {
    return { success: false, error: "Waived charges cannot be paid." };
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .single();

  if (!lease) {
    return { success: false, error: "Lease not found for this charge." };
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found for this lease." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for this charge." };
  }

  const isTenant = lease.tenant_profile_id === user.id;
  if (!isStripeConfigured()) {
    return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
  }

  const [isAdminSettled, ownerStripeSettled] = await Promise.allSettled([
    canUserAdministerProperty(user.id, property.id),
    getOwnerStripeAccountForProperty(property.id)
  ]);

  if (isAdminSettled.status === "rejected") {
    console.error("payWithCard permission error:", isAdminSettled.reason);
    return { success: false, error: "Unable to verify access for this charge right now." };
  }

  if (!isAdminSettled.value && !isTenant) {
    redirect("/");
  }

  if (ownerStripeSettled.status === "rejected") {
    console.error("payWithCard owner stripe error:", ownerStripeSettled.reason);
    return { success: false, error: "This property is not ready to accept online payments yet." };
  }

  if (!ownerStripeSettled.value) {
    return { success: false, error: "This property is not ready to accept online payments yet." };
  }

  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    charge,
    propertyId: property.id,
    ownerStripeAccount: ownerStripeSettled.value,
    userId: user.id
  };
}

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
    sideEffectError("payWithCard", "start_stripe_checkout", {
      userId,
      entityType: "rent_charge",
      entityId: charge.id
    })(error);
    return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
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
    sideEffectError("payWithACH", "start_stripe_checkout", {
      userId,
      entityType: "rent_charge",
      entityId: charge.id
    })(error);
    return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
  }

  if (session.url) {
    redirect(session.url);
  }

  return { success: false, error: PAYMENTS_UNAVAILABLE_MESSAGE };
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
    return { success: false, error: "Unable to load this charge right now." };
  }
  const charge = chargeQuery.data;

  if (!charge) {
    return { success: false, error: "Charge not found." };
  }

  if (charge.status === "paid") {
    return { success: false, error: "This charge is already marked paid." };
  }
  if (charge.status === "waived") {
    return { success: false, error: "Waived charges cannot be paid." };
  }

  if (amountCents !== charge.amount_cents) {
    return {
      success: false,
      error: "Payment amount must match the charge amount exactly."
    };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (!lease) {
    return { success: false, error: "Lease not found for this charge." };
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
      return { success: false, error: "Payment already recorded for this charge." };
    }
    return { success: false, error: "Failed to record manual payment." };
  }

  const { error: chargeUpdateError } = await admin
    .from("rent_charges")
    .update({ status: "paid" })
    .in("status", ["pending", "late"])
    .eq("id", charge.id);

  if (chargeUpdateError) {
    return { success: false, error: "Payment recorded, but failed to mark charge as paid." };
  }

  const { data: tenantProfile } = lease.tenant_profile_id
    ? await admin
        .from("profiles")
        .select("id, email")
        .eq("id", lease.tenant_profile_id)
        .maybeSingle()
    : { data: null };

  void notifyOwnerMembersForProperty({
    propertyId: unit.property_id,
    type: "payment_recorded",
    title: "Rent Payment Received",
    body: `A payment of ${formatCurrency(amountCents)} was recorded for Unit ${unit.unit_number}.`,
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

  if (tenantProfile?.id) {
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

    const isOnTime = paidAt.slice(0, 10) <= charge.due_date;
    void awardXp(
      tenantProfile.id,
      isOnTime ? "rent_paid_on_time" : "rent_paid_late",
      isOnTime ? XP_VALUES.rent_paid_on_time : XP_VALUES.rent_paid_late,
      isOnTime ? "Rent payment recorded on time." : "Rent payment recorded after the due date.",
      {
        charge_id: charge.id,
        recorded_by: user.id,
        method
      }
    ).catch(
      sideEffectError("recordManualPayment", "award_xp", {
        userId: user.id,
        entityType: "xp_event",
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
