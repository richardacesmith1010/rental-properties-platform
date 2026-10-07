"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPropertyMessageEmail } from "@/lib/email-templates";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import { createNotificationWithDelivery, type NotificationType } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
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
    .select("id, lease_id, due_date, amount_cents, status")
    .eq("id", chargeId)
    .maybeSingle();

  if (!charge) {
    return { success: false, error: "Payment not found." };
  }

  if (charge.status === "paid" || charge.status === "waived") {
    return { success: false, error: "This payment is already closed." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (!lease || lease.tenant_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this payment." };
  }

  const [{ data: unit }, { data: profile }] = await Promise.all([
    admin.from("units").select("property_id, unit_number").eq("id", lease.unit_id).maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);

  if (!unit?.property_id) {
    return { success: false, error: "This payment is missing property information." };
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
    return { success: false, error: "Failed to create a review request." };
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
    return { success: false, error: "Failed to create a confirmation request." };
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

  revalidatePath("/tenant");
  revalidatePath("/owner");

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
