"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { formatCurrency } from "@/lib/format";
import { isStripeConfigured } from "@/lib/env";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRetry } from "@/lib/retry";
import { payChargeSchema, parseFormData, recordManualPaymentSchema } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const PAYMENTS_UNAVAILABLE_MESSAGE =
  "Payment processing is temporarily unavailable. Please try again later.";

function isRetryableStripeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed|network|timeout|timed out|ecconn|socket/i.test(message) ||
    /Stripe .* failed: 5\d\d/i.test(message)
  );
}

export async function createCheckoutForCharge(formData: FormData): Promise<ActionState | void> {
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`createCheckoutForCharge:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(payChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { chargeId } = parsed.data;

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, amount_cents, status, lease_id")
    .eq("id", chargeId)
    .single();

  if (!charge) {
    return { success: false, error: "Charge not found." };
  }
  if (charge.status === "paid") {
    return { success: false, error: "This charge has already been paid." };
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
    console.error("createCheckoutForCharge permission error:", isAdminSettled.reason);
    return { success: false, error: "Unable to verify access for this charge right now." };
  }

  if (!isAdminSettled.value && !isTenant) {
    redirect("/");
  }

  if (ownerStripeSettled.status === "rejected") {
    console.error("createCheckoutForCharge owner stripe error:", ownerStripeSettled.reason);
    return { success: false, error: "This property is not ready to accept online payments yet." };
  }

  if (!ownerStripeSettled.value) {
    return { success: false, error: "This property is not ready to accept online payments yet." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let session;
  try {
    session = await withRetry(
      () =>
        createStripeCheckoutSession({
          amountCents: charge.amount_cents,
          metadata: {
            charge_id: charge.id,
            user_id: user.id
          },
          successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${appUrl}/payments/cancel`,
          transferGroup: `charge_${charge.id}`
        }),
      {
        maxAttempts: 2,
        baseDelayMs: 250,
        retryIf: isRetryableStripeError
      }
    );
  } catch (error) {
    sideEffectError("createCheckoutForCharge", "start_stripe_checkout", {
      userId: user.id,
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
  const { data: charge } = await admin
    .from("rent_charges")
    .select("id, lease_id, due_date, status, amount_cents")
    .eq("id", chargeId)
    .maybeSingle();

  if (!charge) {
    return { success: false, error: "Charge not found." };
  }

  if (charge.status === "paid") {
    return { success: false, error: "This charge is already marked paid." };
  }

  if (amountCents > charge.amount_cents) {
    return {
      success: false,
      error: `Payment amount ($${amountDollars.toFixed(2)}) exceeds the charge amount ($${(charge.amount_cents / 100).toFixed(2)}).`
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
