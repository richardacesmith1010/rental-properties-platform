"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { formatCurrency } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { payChargeSchema, parseFormData, recordManualPaymentSchema } from "@/lib/validations";
import type { ActionState } from "./shared";

export async function createCheckoutForCharge(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parseFormData(payChargeSchema, formData);
  if (!parsed.success) {
    return;
  }

  const { chargeId } = parsed.data;

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager" && role !== "tenant") {
    redirect("/");
  }

  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, amount_cents, status, lease_id")
    .eq("id", chargeId)
    .single();

  if (!charge || charge.status === "paid") {
    return;
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .single();

  if (!lease) {
    return;
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return;
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return;
  }

  const isAdmin = await canUserAdministerProperty(user.id, property.id);
  const isTenant = lease.tenant_profile_id === user.id;
  if (!isAdmin && !isTenant) {
    redirect("/");
  }

  if (!(await getOwnerStripeAccountForProperty(property.id))) {
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await createStripeCheckoutSession({
    amountCents: charge.amount_cents,
    metadata: {
      charge_id: charge.id,
      user_id: user.id
    },
    successUrl: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/payments/cancel`,
    transferGroup: `charge_${charge.id}`
  });

  if (session.url) {
    redirect(session.url);
  }
}

export async function recordManualPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // 1) Authenticate
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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

  // 3) Role check
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    return { success: false, error: "Unauthorized." };
  }

  // 4) Property-level permission
  const admin = createAdminClient();
  const { data: charge } = await admin
    .from("rent_charges")
    .select("id, lease_id, due_date, status")
    .eq("id", chargeId)
    .maybeSingle();

  if (!charge) {
    return { success: false, error: "Charge not found." };
  }

  if (charge.status === "paid") {
    return { success: false, error: "This charge is already marked paid." };
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
