import "server-only";
import { formatCurrency, formatUnitLabel } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import { createNotificationWithDelivery, notifyPropertyTeam } from "@/lib/notifications";
import { tenantEligibleForEvent } from "@/lib/notification-policy";
import { type AdminClient, type Ctx, getCtx } from "./context";

export function notifyManagerOfFeeTransfer(
  supabase: AdminClient,
  params: {
    managerProfileId: string;
    amountCents: number;
    chargeId: string;
    managerPaymentId: string;
  }
) {
  void (async () => {
    const [{ data: managerProfile, error: managerProfileError }, ctxResult] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", params.managerProfileId).maybeSingle(),
      getCtx(supabase, params.chargeId)
    ]);

    if (managerProfileError) {
      console.error("[stripe-webhook] notifyManagerOfFeeTransfer manager profile lookup:", managerProfileError);
    }

    const propertyName = ctxResult.ok ? ctxResult.ctx.property.name : "your property";
    const unitNumber = ctxResult.ok ? ctxResult.ctx.unit.unit_number : null;
    const locationLabel = unitNumber ? `${propertyName} ${formatUnitLabel(unitNumber)}` : propertyName;

    await createNotificationWithDelivery({
      recipientProfileId: params.managerProfileId,
      recipientEmail: managerProfile?.email ?? null,
      type: "payment_recorded",
      title: "Management fee received",
      body: `Your management fee of ${formatCurrency(params.amountCents)} for ${locationLabel} was sent to your bank.`,
      entityType: "manager_payment",
      entityId: params.managerPaymentId
    });
  })().catch(sideEffectError("notifyManagerOfFeeTransfer", "notify_manager", {
    userId: params.managerProfileId,
    entityType: "rent_charge",
    entityId: params.chargeId
  }));
}

export function queuePaymentNotifications(ctx: Ctx, amountCents: number) {
  void notifyPropertyTeam({
    propertyId: ctx.property.id,
    event: "rent_paid_stripe",
    type: "payment_recorded",
    title: "Rent Payment Received",
    body: `A payment of ${formatCurrency(amountCents)} was recorded for ${formatUnitLabel(ctx.unit.unit_number)}.`,
    entityType: "rent_charge",
    entityId: ctx.charge.id
  }).catch(sideEffectError("handlePaymentSucceeded", "notify_owner", {
    userId: ctx.tenantProfile?.id ?? "system",
    entityType: "rent_charge",
    entityId: ctx.charge.id
  }));

  if (ctx.tenantProfile?.id && tenantEligibleForEvent("rent_paid_stripe", ctx.lease.collects_outside_domus)) {
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

export function queueAutopayFailure(
  context: Ctx | null,
  tenantProfile: { id: string; email: string | null } | null,
  disabled: boolean,
  stripeObjectId: string
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
      entityId: context?.charge.id,
      emailKey: `payment-failed-${stripeObjectId}`
    }).catch(sideEffectError("handlePaymentFailed", "notify_tenant", {
      userId: tenantProfile.id,
      entityType: "rent_charge",
      entityId: context?.charge.id
    }));
  }

  if (context?.property.id) {
    void notifyPropertyTeam({
      propertyId: context.property.id,
      event: "autopay_failed",
      type: "late_rent",
      title: "Autopay Failed",
      body: `Automatic payment failed for ${formatUnitLabel(context.unit.unit_number)}.`,
      entityType: "rent_charge",
      entityId: context.charge.id
    }).catch(sideEffectError("handlePaymentFailed", "notify_owner", {
      userId: tenantProfile?.id ?? "system",
      entityType: "rent_charge",
      entityId: context.charge.id
    }));
  }
}
