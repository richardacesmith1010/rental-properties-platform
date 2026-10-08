import "server-only";

import { redirect } from "next/navigation";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { MIN_ONLINE_PAYMENT_CENTS } from "@/lib/payment-fees";
import { getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { assertStripeEligibleProperty, STRIPE_CLIENT_MESSAGE } from "@/lib/client-accounts";
import { canUserAdministerProperty } from "@/lib/property-access";
import { notifyOwnerOfStripeIssue } from "@/lib/notifications";
import { isStripeConfigured } from "@/lib/env";
import { sideEffectError } from "@/lib/logger";
import { sendPlatformAlert } from "@/lib/platform-alerts";
import { checkRateLimit } from "@/lib/rate-limit";
import { categorizeStripeError, userMessageForCategory } from "@/lib/stripe-errors";
import { payChargeSchema, parseFormData } from "@/lib/validations";
import { requireAuth } from "@/app/actions/auth-helpers";
import type { ActionState } from "@/app/actions/shared";

export const PAYMENTS_UNAVAILABLE_MESSAGE =
  "Payment processing is temporarily unavailable. Please try again later.";

export function isRetryableStripeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed|network|timeout|timed out|ecconn|socket/i.test(message) ||
    /Stripe .* failed: 5\d\d/i.test(message)
  );
}

export type CheckoutContext = {
  appUrl: string;
  charge: { id: string; amount_cents: number; status: string; lease_id: string };
  propertyId: string;
  ownerStripeAccount: string;
  userId: string;
};

export function isCheckoutContext(value: ActionState | CheckoutContext): value is CheckoutContext {
  return Boolean(value && "charge" in value);
}

export function handleStripeCheckoutFailure(params: {
  actionName: "payWithCard" | "payWithACH";
  error: unknown;
  userId: string;
  chargeId: string;
  propertyId: string;
}): ActionState {
  sideEffectError(params.actionName, "start_stripe_checkout", {
    userId: params.userId,
    entityType: "rent_charge",
    entityId: params.chargeId
  })(params.error);

  const category = categorizeStripeError(params.error);

  if (category === "owner_not_connected") {
    void notifyOwnerOfStripeIssue({
      propertyId: params.propertyId,
      category
    }).catch(
      sideEffectError(params.actionName, "notify_owner_of_stripe_issue", {
        userId: params.userId,
        entityType: "rent_charge",
        entityId: params.chargeId
      })
    );
  } else if (category === "platform_misconfigured") {
    const errorMessage =
      params.error instanceof Error ? params.error.message : String(params.error);

    void sendPlatformAlert({
      subject: "Stripe Connect platform issue",
      body: `${params.actionName} failed for payment ${params.chargeId} (property ${params.propertyId}). Error: ${errorMessage}`,
      dedupeKey: `platform_misconfigured:${params.actionName}`
    }).catch(
      sideEffectError(params.actionName, "send_platform_alert", {
        userId: params.userId,
        entityType: "rent_charge",
        entityId: params.chargeId
      })
    );
  }

  return { success: false, error: userMessageForCategory(category) };
}

export async function prepareCheckoutContext(
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
    return { success: false, error: "We couldn't find this rent. Refresh the page." };
  }
  const charge = chargeQuery.data;

  if (!charge) {
    return { success: false, error: "We couldn't find this rent. Refresh the page." };
  }
  if (charge.status === "paid") {
    return { success: false, error: "This rent was already paid." };
  }
  if (charge.status === "waived") {
    return { success: false, error: "This rent was cancelled by your landlord." };
  }
  if (charge.amount_cents < MIN_ONLINE_PAYMENT_CENTS) {
    return {
      success: false,
      error: `Online pay starts at $${(MIN_ONLINE_PAYMENT_CENTS / 100).toFixed(2)}. Ask your landlord to record it.`
    };
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .single();

  if (!lease) {
    return { success: false, error: "We couldn't find the lease for this rent." };
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
    return { success: false, error: "We couldn't find the property for this rent." };
  }

  try {
    await assertStripeEligibleProperty(property.id);
  } catch {
    return { success: false, error: STRIPE_CLIENT_MESSAGE };
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
    return { success: false, error: "Unable to verify access for this rent right now." };
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
