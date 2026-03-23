"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPropertyMessageEmail
} from "@/lib/email-templates";
import { formatCurrency, formatDate } from "@/lib/format";
import { logFailedSideEffect } from "@/lib/logger";
import {
  createNotificationWithDelivery,
  type NotificationType
} from "@/lib/notifications";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createInboxThreadSchema,
  parseFormData,
  requestManualPaymentConfirmationSchema,
  sendInboxMessageSchema,
  sendMessageToTenantSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

interface PropertyContext {
  propertyName: string;
  ownerAccountId: string | null;
}

interface TenantRecipientContext {
  propertyName: string;
  unitNumber: string;
  recipientName: string;
  recipientEmail: string | null;
}

interface OwnerRecipient {
  id: string;
  email: string | null;
  name: string;
}

function getProfileDisplayName(
  profile: { full_name?: string | null; email?: string | null } | null | undefined,
  fallback: string
) {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const email = profile?.email?.trim();
  if (email) {
    return email;
  }

  return fallback;
}

async function loadPropertyContext(propertyId: string): Promise<PropertyContext | null> {
  const admin = createAdminClient();
  const { data: property } = await admin
    .from("properties")
    .select("name, owner_account_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) {
    return null;
  }

  return {
    propertyName: property.name ?? "Property",
    ownerAccountId: property.owner_account_id ?? null
  };
}

async function loadTenantRecipientContext(
  recipientProfileId: string,
  propertyId: string
): Promise<TenantRecipientContext | null> {
  const admin = createAdminClient();
  const { data: units } = await admin
    .from("units")
    .select("id, unit_number")
    .eq("property_id", propertyId);

  const unitRows = units ?? [];
  if (unitRows.length === 0) {
    return null;
  }

  const unitIds = unitRows.map((unit) => unit.id);
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit.unit_number ?? "Unit"]));
  const [{ data: lease }, { data: property }, { data: profile }] = await Promise.all([
    admin
      .from("leases")
      .select("id, unit_id")
      .eq("tenant_profile_id", recipientProfileId)
      .eq("active", true)
      .in("unit_id", unitIds)
      .limit(1)
      .maybeSingle(),
    admin
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", recipientProfileId)
      .maybeSingle()
  ]);

  if (!lease) {
    return null;
  }

  return {
    propertyName: property?.name ?? "Property",
    unitNumber: unitById.get(lease.unit_id) ?? "Unit",
    recipientName: getProfileDisplayName(profile, "Tenant"),
    recipientEmail: profile?.email ?? null
  };
}

async function isTenantAuthorizedForThread(userId: string, propertyId: string) {
  const admin = createAdminClient();
  const { data: units } = await admin
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = (units ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return false;
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id")
    .eq("tenant_profile_id", userId)
    .eq("active", true)
    .in("unit_id", unitIds)
    .limit(1)
    .maybeSingle();

  return Boolean(lease);
}

async function findOrCreateTenantThread(params: {
  propertyId: string;
  recipientProfileId: string;
  subject: string;
  createdByProfileId: string;
}) {
  const admin = createAdminClient();
  const { data: existingThread } = await admin
    .from("inbox_threads")
    .select("id")
    .eq("property_id", params.propertyId)
    .eq("entity_type", "tenant_profile")
    .eq("entity_id", params.recipientProfileId)
    .eq("subject", params.subject)
    .limit(1)
    .maybeSingle();

  if (existingThread?.id) {
    return existingThread.id;
  }

  const { data: createdThread, error } = await admin
    .from("inbox_threads")
    .insert({
      property_id: params.propertyId,
      entity_type: "tenant_profile",
      entity_id: params.recipientProfileId,
      subject: params.subject,
      created_by_profile_id: params.createdByProfileId,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error || !createdThread?.id) {
    return null;
  }

  return createdThread.id;
}

async function insertInboxMessage(params: {
  threadId: string;
  senderProfileId: string;
  senderEmail?: string | null;
  body: string;
  direction: "inbound" | "outbound";
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("inbox_messages").insert({
    thread_id: params.threadId,
    sender_profile_id: params.senderProfileId,
    sender_email: params.senderEmail ?? null,
    body: params.body,
    channel: "in_app",
    direction: params.direction
  });

  return error;
}

async function touchInboxThread(threadId: string, userId: string) {
  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();
  let { error: threadUpdateError } = await admin
    .from("inbox_threads")
    .update({ updated_at: updatedAt })
    .eq("id", threadId);

  if (threadUpdateError) {
    logFailedSideEffect(
      {
        action: "sendInboxMessage",
        operation: "update_thread_timestamp",
        userId,
        entityType: "inbox_thread",
        entityId: threadId
      },
      threadUpdateError
    );

    const retryResult = await admin
      .from("inbox_threads")
      .update({ updated_at: updatedAt })
      .eq("id", threadId);
    threadUpdateError = retryResult.error;
  }

  if (threadUpdateError) {
    logFailedSideEffect(
      {
        action: "sendInboxMessage",
        operation: "update_thread_timestamp_retry",
        userId,
        entityType: "inbox_thread",
        entityId: threadId
      },
      threadUpdateError
    );
  }

  return threadUpdateError;
}

async function loadOwnerRecipients(
  propertyId: string,
  excludeProfileId?: string | null
): Promise<Array<OwnerRecipient>> {
  const admin = createAdminClient();
  const property = await loadPropertyContext(propertyId);
  if (!property?.ownerAccountId) {
    return [];
  }

  const { data: members } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", property.ownerAccountId)
    .eq("member_role", "owner")
    .eq("active", true);

  const profileIds = (members ?? [])
    .map((member) => member.profile_id)
    .filter((profileId) => profileId !== excludeProfileId);

  if (profileIds.length === 0) {
    return [];
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", profileIds);

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: profile.email ?? null,
    name: getProfileDisplayName(profile, "Owner")
  }));
}

async function notifyTenantOfDirectMessage(params: {
  recipientProfileId: string;
  recipientEmail: string | null;
  recipientName: string;
  senderName: string;
  propertyName: string;
  messageBody: string;
  threadId: string;
  propertyId: string;
  actorProfileId: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const email = buildPropertyMessageEmail({
    recipientName: params.recipientName,
    senderName: params.senderName,
    propertyName: params.propertyName,
    messageContent: params.messageBody,
    dashboardUrl: `${appUrl}/tenant?section=notifications`
  });

  await createNotificationWithDelivery({
    recipientProfileId: params.recipientProfileId,
    recipientEmail: params.recipientEmail,
    type: "owner_message",
    title: `Message from ${params.senderName}`,
    body: `${params.senderName} sent you a message about ${params.propertyName}.`,
    entityType: "inbox_thread",
    entityId: params.threadId,
    propertyId: params.propertyId,
    actorProfileId: params.actorProfileId,
    emailContent: email
  });
}

async function notifyOwnersOfTenantReply(params: {
  propertyId: string;
  senderName: string;
  propertyName: string;
  messageBody: string;
  threadId: string;
  actorProfileId: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const owners = await loadOwnerRecipients(params.propertyId, params.actorProfileId);

  await Promise.all(
    owners.map((owner) =>
      createNotificationWithDelivery({
        recipientProfileId: owner.id,
        recipientEmail: owner.email,
        type: "owner_message",
        title: `Message from ${params.senderName}`,
        body: `${params.senderName} replied about ${params.propertyName}.`,
        entityType: "inbox_thread",
        entityId: params.threadId,
        propertyId: params.propertyId,
        actorProfileId: params.actorProfileId,
        emailContent: buildPropertyMessageEmail({
          recipientName: owner.name,
          senderName: params.senderName,
          propertyName: params.propertyName,
          messageContent: params.messageBody,
          dashboardUrl: `${appUrl}/owner?section=inbox`
        })
      })
    )
  );
}

async function loadSenderName(userId: string, fallbackEmail?: string | null) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return getProfileDisplayName(profile, fallbackEmail ?? "Domus");
}

async function ensureTenantThreadCapability() {
  const capabilityError = await ensureCapabilityEnabled("inboxThreadsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  return null;
}

export async function createInboxThread(
  _prev: ActionState,
  formData: FormData
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
    created_by_profile_id: user.id
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
  formData: FormData
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
    createdByProfileId: user.id
  });

  if (!threadId) {
    return { success: false, error: "Failed to create a message thread." };
  }

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    senderEmail: user.email ?? null,
    body,
    direction: "outbound"
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
    actorProfileId: user.id
  });

  const threadUpdateError = await touchInboxThread(threadId, user.id);

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");

  if (threadUpdateError) {
    return {
      success: true,
      message: "Message sent, but the thread activity timestamp is catching up."
    };
  }

  return { success: true, message: "Message sent." };
}

export async function sendInboxMessage(
  _prev: ActionState,
  formData: FormData
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
    direction
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
        actorProfileId: user.id
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
          actorProfileId: user.id
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
      message: "Message sent, but the thread activity timestamp is catching up."
    };
  }

  return { success: true };
}

export async function requestManualPaymentConfirmation(
  _prev: ActionState,
  formData: FormData
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
    return { success: false, error: "Charge not found." };
  }

  if (charge.status === "paid" || charge.status === "waived") {
    return { success: false, error: "This charge is already closed." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();

  if (!lease || lease.tenant_profile_id !== user.id) {
    return { success: false, error: "You do not have access to this charge." };
  }

  const [{ data: unit }, { data: profile }] = await Promise.all([
    admin
      .from("units")
      .select("property_id, unit_number")
      .eq("id", lease.unit_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle()
  ]);

  if (!unit?.property_id) {
    return { success: false, error: "This charge is missing property information." };
  }

  const propertyContext = await loadPropertyContext(unit.property_id);
  const propertyName = propertyContext?.propertyName ?? "Property";
  const tenantName = getProfileDisplayName(profile, user.email ?? "Tenant");
  const subject = `Manual payment review - ${propertyName} • Unit ${unit.unit_number ?? "Unit"}`;
  const threadId = await findOrCreateTenantThread({
    propertyId: unit.property_id,
    recipientProfileId: user.id,
    subject,
    createdByProfileId: user.id
  });

  if (!threadId) {
    return { success: false, error: "Failed to create a review request." };
  }

  const messageBody = `${tenantName} reported paying ${formatCurrency(charge.amount_cents)} for ${propertyName} • Unit ${unit.unit_number ?? "Unit"} manually. Charge due ${formatDate(charge.due_date)}. Please confirm receipt in Charges.`;

  const messageError = await insertInboxMessage({
    threadId,
    senderProfileId: user.id,
    senderEmail: user.email ?? null,
    body: messageBody,
    direction: "inbound"
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
        title: "Manual payment confirmation needed",
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
          dashboardUrl: `${appUrl}/owner?section=charges`
        })
      })
    )
  );

  const threadUpdateError = await touchInboxThread(threadId, user.id);

  revalidatePath("/tenant");
  revalidatePath("/owner");

  if (threadUpdateError) {
    return {
      success: true,
      message: "Manual payment request sent, but the conversation activity timestamp is catching up."
    };
  }

  return {
    success: true,
    message: "Manual payment request sent to your landlord for confirmation."
  };
}
