"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPropertyMessageEmail } from "@/lib/email-templates";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import { createNotificationWithDelivery, type NotificationType } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import { sideEffectError } from "@/lib/logger";
import { parseFormData, requestManualPaymentConfirmationSchema } from "@/lib/validations";
import {
  ensureTenantThreadCapability,
  getProfileDisplayName,
  loadPropertyContext,
  findOrCreateTenantThread,
  insertInboxMessage,
  loadOwnerRecipients,
  touchInboxThread,
} from "@/lib/inbox/action-helpers";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export async function requestManualPaymentConfirmation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth("tenant");
  const rateLimited = checkRateLimit(`requestManualPaymentConfirmation:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureTenantThreadCapability();
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(requestManualPaymentConfirmationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { chargeId } = parsed.data;
  const { data: charge } = await admin
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status, tenant_reported_paid_at")
    .eq("id", chargeId)
    .maybeSingle();

  if (!charge) {
    return { success: false, error: "Payment not found." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (!lease || lease.tenant_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this payment." };
  }

  if (charge.status === "paid" || charge.status === "waived") {
    return { success: false, error: "This payment is already closed." };
  }

  const { data: claimed, error: claimError } = await admin
    .from("rent_charges")
    .update({ tenant_reported_paid_at: new Date().toISOString() })
    .eq("id", chargeId)
    .is("tenant_reported_paid_at", null)
    .is("deleted_at", null)
    .in("status", ["pending", "late"])
    .select("id");
  if (claimError) {
    return { success: false, error: "Could not send. Please try again." };
  }
  if (!claimed?.length) {
    const { data: current, error: rereadError } = await admin
      .from("rent_charges")
      .select("id, status, tenant_reported_paid_at, deleted_at")
      .eq("id", chargeId)
      .maybeSingle();
    if (rereadError) return { success: false, error: "Could not send. Please try again." };
    if (!current || current.deleted_at) return { success: false, error: "Payment not found." };
    if (current.tenant_reported_paid_at) {
      return { success: true, message: "Already sent. Your landlord will check and mark it paid." };
    }
    if (current.status === "paid" || current.status === "waived") {
      return { success: false, error: "This payment is already closed." };
    }
    sideEffectError("requestManualPaymentConfirmation", "tenant_report_claim_contention", {
      userId: user.id, entityType: "rent_charge", entityId: chargeId
    })(new Error("Claim returned no rows for an open, unreported charge."));
    return { success: false, error: "Could not send. Please try again." };
  }

  const sent = { success: true as const, message: "Sent. Your landlord will check and mark it paid." };
  const revalidateReport = () => {
    revalidatePath("/tenant");
    revalidatePath("/owner");
  };

  const [{ data: unit }, { data: profile }] = await Promise.all([
    admin.from("units").select("property_id, unit_number").eq("id", lease.unit_id).maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);

  if (!unit?.property_id) {
    sideEffectError("requestManualPaymentConfirmation", "load_property", {
      userId: user.id, entityType: "rent_charge", entityId: chargeId
    })(new Error("Claimed charge has no property."));
    revalidateReport();
    return sent;
  }

  const propertyContext = await loadPropertyContext(unit.property_id);
  const propertyName = propertyContext?.propertyName ?? "Property";
  const tenantName = getProfileDisplayName(profile, user.email ?? "Tenant");
  const locationLabel = unit.unit_number
    ? `${propertyName} • ${formatUnitLabel(unit.unit_number)}`
    : propertyName;
  const subject = `Manual payment review - ${locationLabel}`;
  const threadId = await findOrCreateTenantThread({
    propertyId: unit.property_id,
    recipientProfileId: user.id,
    subject,
    createdByProfileId: user.id,
  });

  if (!threadId) {
    sideEffectError("requestManualPaymentConfirmation", "create_thread", {
      userId: user.id, entityType: "rent_charge", entityId: chargeId
    })(new Error("Thread was not created."));
    revalidateReport();
    return sent;
  }

  const messageBody = [
    `${tenantName} says they paid ${formatCurrency(charge.amount_cents)} for ${locationLabel}. `,
    `Rent due ${formatDate(charge.due_date)}. Please check, then mark it paid in Rent.`
  ].join("");

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    senderEmail: user.email ?? null,
    body: messageBody,
    direction: "inbound",
  });

  if (messageError) {
    sideEffectError("requestManualPaymentConfirmation", "insert_message", {
      userId: user.id, entityType: "rent_charge", entityId: chargeId
    })(messageError);
    revalidateReport();
    return sent;
  }

  const owners = await loadOwnerRecipients(unit.property_id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  await Promise.all(
    owners.map((owner) =>
      createNotificationWithDelivery({
        recipientProfileId: owner.id,
        recipientEmail: owner.email,
        type: "owner_message" satisfies NotificationType,
        title: "Tenant says rent is paid",
        body: `${tenantName} reported a manual payment for ${propertyName}.`,
        entityType: "inbox_thread",
        entityId: threadId,
        propertyId: unit.property_id,
        actorProfileId: user.id,
        emailContent: buildPropertyMessageEmail({
          recipientName: owner.name,
          senderName: tenantName,
          propertyName,
          messageContent: messageBody,
          dashboardUrl: `${appUrl}/owner?section=charges`,
        }),
      }),
    ),
  );

  const threadUpdateError = await touchInboxThread(threadId, user.id);

  revalidateReport();

  if (threadUpdateError) {
    return {
      success: true,
      message:
        "Manual payment request sent, but the conversation activity timestamp is catching up.",
    };
  }

  return {
    success: true,
    message: "Manual payment request sent to your landlord for confirmation.",
  };
}
