"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithDelivery } from "@/lib/notifications";
import { canUserAdministerProperty, getAdministeredPropertyIds } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createInboxThreadSchema,
  parseFormData,
  sendInboxMessageSchema,
  sendMessageToTenantSchema,
} from "@/lib/validations";
import {
  TENANT_CONVERSATION_SUBJECT,
  startTenantConversationSchema,
  loadTenantRecipientContext,
  isTenantAuthorizedForThread,
  findOrCreateTenantThread,
  insertInboxMessage,
  touchInboxThread,
  notifyTenantOfDirectMessage,
  notifyOwnersOfTenantReply,
  loadSenderName,
  ensureTenantThreadCapability,
} from "@/lib/inbox/action-helpers";
import { requireAuth } from "./auth-helpers";
import { type ActionState } from "./shared";

export async function startTenantConversation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth("tenant");
  const parsed = startTenantConversationSchema.safeParse({
    body: formData.get("body"),
    propertyId: formData.get("propertyId") || undefined,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check your message." };
  }

  if (!checkRateLimit(`startTenantConversation:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many messages. Please try again later." };
  }

  const capabilityError = await ensureTenantThreadCapability();
  if (capabilityError) return capabilityError;

  const admin = createAdminClient();
  const { data: leases, error: leaseError } = await admin
    .from("leases")
    .select("unit_id")
    .eq("tenant_profile_id", user.id)
    .eq("active", true);
  if (leaseError)
    return { success: false, error: "We could not check your lease. Please try again." };
  const unitIds = [...new Set((leases ?? []).map((lease) => lease.unit_id).filter(Boolean))];
  if (!unitIds.length)
    return { success: false, error: "You need an active lease to message your landlord." };

  const { data: units, error: unitsError } = await admin
    .from("units")
    .select("property_id")
    .in("id", unitIds);
  if (unitsError)
    return { success: false, error: "We could not check your home. Please try again." };
  const propertyIds = [...new Set((units ?? []).map((unit) => unit.property_id).filter(Boolean))];
  if (!propertyIds.length)
    return { success: false, error: "You need an active lease to message your landlord." };
  if (parsed.data.propertyId && !propertyIds.includes(parsed.data.propertyId)) {
    return { success: false, error: "You cannot message about this home." };
  }
  if (!parsed.data.propertyId && propertyIds.length > 1) {
    return { success: false, error: "Choose which home this is about." };
  }
  const propertyId = parsed.data.propertyId ?? propertyIds[0];

  const threadId = await findOrCreateTenantThread({
    propertyId,
    recipientProfileId: user.id,
    subject: TENANT_CONVERSATION_SUBJECT,
    createdByProfileId: user.id,
  });
  if (!threadId) return { success: false, error: "Your message didn't send. Please try again." };

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    body: parsed.data.body,
    direction: "inbound",
  });
  if (messageError) return { success: false, error: "Your message didn't send. Please try again." };

  // A timestamp failure cannot undo an inserted message.
  await touchInboxThread(threadId, user.id);

  try {
    const { data: property } = await admin
      .from("properties")
      .select("owner_account_id")
      .eq("id", propertyId)
      .maybeSingle();
    const [{ data: owners }, { data: managers }] = await Promise.all([
      property?.owner_account_id
        ? admin
            .from("ownership_account_members")
            .select("profile_id")
            .eq("account_id", property.owner_account_id)
            .eq("member_role", "owner")
            .eq("active", true)
        : Promise.resolve({ data: [] as Array<{ profile_id: string }> }),
      admin
        .from("property_managers")
        .select("manager_profile_id")
        .eq("property_id", propertyId)
        .eq("active", true),
    ]);
    const candidates = [
      ...new Set([
        ...(owners ?? []).map((owner) => owner.profile_id),
        ...(managers ?? []).map((manager) => manager.manager_profile_id),
      ]),
    ].filter((id) => id !== user.id);
    const authorized = await Promise.all(
      candidates.map(async (id) =>
        (await getAdministeredPropertyIds(id, admin)).includes(propertyId) ? id : null,
      ),
    );
    await Promise.all(
      authorized
        .filter((id): id is string => Boolean(id))
        .map((id) =>
          createNotificationWithDelivery({
            recipientProfileId: id,
            type: "owner_message",
            title: "New message from a tenant",
            body: "A tenant sent a message about your property.",
            entityType: "inbox_thread",
            entityId: threadId,
            propertyId,
            actorProfileId: user.id,
          }),
        ),
    );
  } catch (error) {
    console.error("tenant_message_notification_failed", {
      userId: user.id,
      propertyId,
      threadId,
      category: error instanceof Error ? "delivery_error" : "unknown_error",
    });
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Sent. Your landlord will see it in Messages." };
}

export async function createInboxThread(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`createInboxThread:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureTenantThreadCapability();
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createInboxThreadSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, subject, entityType, entityId } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("inbox_threads").insert({
    property_id: propertyId,
    entity_type: entityType,
    entity_id: entityId || null,
    subject,
    created_by_profile_id: user.id,
  });

  if (error) {
    return { success: false, error: "Failed to create inbox thread." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function sendMessageToTenant(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`sendMessageToTenant:${user.id}`, 30, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureTenantThreadCapability();
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendMessageToTenantSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { recipientProfileId, propertyId, subject, body } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this tenant." };
  }

  const recipient = await loadTenantRecipientContext(recipientProfileId, propertyId);
  if (!recipient) {
    return { success: false, error: "Tenant not found for this property." };
  }

  const threadId = await findOrCreateTenantThread({
    propertyId,
    recipientProfileId,
    subject,
    createdByProfileId: user.id,
  });

  if (!threadId) {
    return { success: false, error: "Failed to create a message thread." };
  }

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    senderEmail: user.email ?? null,
    body,
    direction: "outbound",
  });

  if (messageError) {
    return { success: false, error: "Failed to send inbox message." };
  }

  const senderName = await loadSenderName(user.id, user.email ?? null);
  await notifyTenantOfDirectMessage({
    recipientProfileId,
    recipientEmail: recipient.recipientEmail,
    recipientName: recipient.recipientName,
    senderName,
    propertyName: recipient.propertyName,
    messageBody: body,
    threadId,
    propertyId,
    actorProfileId: user.id,
  });

  const threadUpdateError = await touchInboxThread(threadId, user.id);

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");

  if (threadUpdateError) {
    return {
      success: true,
      message: "Message sent, but the thread activity timestamp is catching up.",
    };
  }

  return { success: true, message: "Message sent." };
}

export async function sendInboxMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  const rateLimited = checkRateLimit(`sendInboxMessage:${user.id}`, 60, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureTenantThreadCapability();
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendInboxMessageSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { threadId, body } = parsed.data;
  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("inbox_threads")
    .select("id, property_id, entity_type, entity_id, subject")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    return { success: false, error: "Thread not found." };
  }

  const canAccess =
    role === "tenant"
      ? thread.entity_type === "tenant_profile" &&
        thread.entity_id === user.id &&
        (await isTenantAuthorizedForThread(user.id, thread.property_id))
      : await canUserAdministerProperty(user.id, thread.property_id);

  if (!canAccess) {
    return { success: false, error: "You do not have access to this thread." };
  }

  const direction = role === "tenant" ? "inbound" : "outbound";
  const { data: property } = await admin
    .from("properties")
    .select("name")
    .eq("id", thread.property_id)
    .maybeSingle();
  const propertyName = property?.name ?? "Property";
  const senderName = await loadSenderName(user.id, user.email ?? null);

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    senderEmail: user.email ?? null,
    body,
    direction,
  });

  if (messageError) {
    return { success: false, error: "Failed to send inbox message." };
  }

  if (thread.entity_type === "tenant_profile" && thread.entity_id) {
    if (role === "tenant") {
      await notifyOwnersOfTenantReply({
        propertyId: thread.property_id,
        senderName,
        propertyName,
        messageBody: body,
        threadId,
        actorProfileId: user.id,
      });
    } else {
      const recipient = await loadTenantRecipientContext(thread.entity_id, thread.property_id);
      if (recipient) {
        await notifyTenantOfDirectMessage({
          recipientProfileId: thread.entity_id,
          recipientEmail: recipient.recipientEmail,
          recipientName: recipient.recipientName,
          senderName,
          propertyName,
          messageBody: body,
          threadId,
          propertyId: thread.property_id,
          actorProfileId: user.id,
        });
      }
    }
  }

  const threadUpdateError = await touchInboxThread(threadId, user.id);

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");

  if (threadUpdateError) {
    return {
      success: true,
      message: "Message sent, but the thread activity timestamp is catching up.",
    };
  }

  return { success: true };
}

import { requestManualPaymentConfirmation as runManualPaymentConfirmation } from "./inbox-manual-payment";

export async function requestManualPaymentConfirmation(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runManualPaymentConfirmation(prev, formData);
}
