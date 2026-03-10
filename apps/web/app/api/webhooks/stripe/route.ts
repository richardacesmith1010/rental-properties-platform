import { NextRequest, NextResponse } from "next/server";
import {
  createStripeTransfer,
  type StripeCheckoutSession,
  verifyWebhookSignature
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getManagerStripeAccountForProperty,
  getOwnerStripeAccountForProperty
} from "@/lib/stripe-connect";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";

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

  // Add `account.updated` to the Stripe webhook endpoint after deploying Connect.
  if (event.type === "account.updated") {
    const account = event.data.object;
    const accountId = typeof account.id === "string" ? account.id : null;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;

    if (accountId && chargesEnabled && payoutsEnabled) {
      const supabase = createAdminClient();
      await supabase
        .from("profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", accountId);
    }

    return NextResponse.json({ received: true });
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

  const supabase = createAdminClient();

  // Idempotency: check if already recorded
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingPayment) {
    return NextResponse.json({ received: true, status: "already_recorded" });
  }

  // Validate the charge exists and walk the ownership chain
  const { data: charge } = await supabase
    .from("rent_charges")
    .select("id, lease_id, status")
    .eq("id", chargeId)
    .single();

  if (!charge || charge.status === "paid") {
    return NextResponse.json({ received: true, status: "charge_already_paid_or_missing" });
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .single();

  if (!lease) {
    return NextResponse.json({ error: "Lease not found for charge." }, { status: 422 });
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return NextResponse.json({ error: "Unit not found for lease." }, { status: 422 });
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 422 });
  }

  // Verify the user is authorized (owner member, assigned manager, or tenant).
  const [{ data: ownerMembership }, { data: managerAssignment }] = await Promise.all([
    supabase
      .from("ownership_account_members")
      .select("account_id")
      .eq("account_id", property.owner_account_id)
      .eq("profile_id", userId)
      .eq("member_role", "owner")
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", property.id)
      .eq("manager_profile_id", userId)
      .eq("active", true)
      .maybeSingle()
  ]);

  const isOwner = Boolean(ownerMembership?.account_id);
  const isManager = Boolean(managerAssignment?.property_id);
  const isTenant = lease.tenant_profile_id === userId;

  if (!isOwner && !isManager && !isTenant) {
    return NextResponse.json({ error: "Unauthorized user for this charge." }, { status: 403 });
  }

  // Record the payment
  const { error: insertError } = await supabase.from("payments").insert({
    rent_charge_id: charge.id,
    amount_cents: amountTotal,
    method: "card",
    reference_note: "Stripe Checkout",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
  });

  if (insertError) {
    // Unique constraint violation = already recorded (race condition)
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, status: "already_recorded" });
    }
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }

  // Mark charge as paid
  await supabase.from("rent_charges").update({ status: "paid" }).eq("id", charge.id);

  try {
    const ownerStripeAccount = await getOwnerStripeAccountForProperty(property.id);
    if (ownerStripeAccount) {
      const managerInfo = await getManagerStripeAccountForProperty(property.id);
      const managementFee = managerInfo?.feeCents ?? 0;
      const platformFee = 0;
      const ownerAmount = amountTotal - managementFee - platformFee;
      const paymentUpdate: Record<string, string | number> = {
        platform_fee_cents: platformFee
      };

      if (ownerAmount > 0) {
        const ownerTransfer = await createStripeTransfer({
          amountCents: ownerAmount,
          destination: ownerStripeAccount,
          transferGroup: `charge_${chargeId}`,
          description: `Rent payment for charge ${chargeId.slice(0, 8)}`
        });
        paymentUpdate.stripe_transfer_id = ownerTransfer.id;
      }

      if (managerInfo && managementFee > 0) {
        const managerTransfer = await createStripeTransfer({
          amountCents: managementFee,
          destination: managerInfo.accountId,
          transferGroup: `charge_${chargeId}`,
          description: `Management fee for charge ${chargeId.slice(0, 8)}`
        });
        paymentUpdate.manager_transfer_id = managerTransfer.id;
      }

      await supabase
        .from("payments")
        .update(paymentUpdate)
        .eq("stripe_checkout_session_id", session.id);
    }
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  }

  const { data: tenantProfile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", lease.tenant_profile_id)
    .maybeSingle();

  await notifyOwnerMembersForProperty({
    propertyId: property.id,
    type: "payment_recorded",
    title: "Rent payment recorded",
    body: `A rent payment was recorded for charge ${charge.id.slice(0, 8)}.`,
    entityType: "rent_charge",
    entityId: charge.id
  });

  if (tenantProfile?.id) {
    await createNotificationWithDelivery({
      recipientProfileId: tenantProfile.id,
      recipientEmail: tenantProfile.email,
      type: "payment_recorded",
      title: "Payment received",
      body: "Your rent payment has been recorded successfully.",
      entityType: "rent_charge",
      entityId: charge.id
    });
  }

  return NextResponse.json({ received: true, status: "payment_recorded" });
}
