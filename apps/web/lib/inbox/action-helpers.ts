import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPropertyMessageEmail } from "@/lib/email-templates";
import { createNotificationWithDelivery } from "@/lib/notifications";
import { ensureCapabilityEnabled } from "@/app/actions/shared";

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

export { TENANT_CONVERSATION_SUBJECT } from "./thread-title";
export const startTenantConversationSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(2000, "Keep your message under 2,000 characters."),
  propertyId: z.string().uuid("Choose a valid home.").optional(),
});

export function getProfileDisplayName(
  profile: { full_name?: string | null; email?: string | null } | null | undefined,
  fallback: string,
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

export async function loadPropertyContext(propertyId: string): Promise<PropertyContext | null> {
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
    ownerAccountId: property.owner_account_id ?? null,
  };
}

export async function loadTenantRecipientContext(
  recipientProfileId: string,
  propertyId: string,
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
    admin.from("properties").select("name").eq("id", propertyId).maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", recipientProfileId).maybeSingle(),
  ]);

  if (!lease) {
    return null;
  }

  return {
    propertyName: property?.name ?? "Property",
    unitNumber: unitById.get(lease.unit_id) ?? "Unit",
    recipientName: getProfileDisplayName(profile, "Tenant"),
    recipientEmail: profile?.email ?? null,
  };
}

export async function isTenantAuthorizedForThread(userId: string, propertyId: string) {
  const admin = createAdminClient();
  const { data: units } = await admin.from("units").select("id").eq("property_id", propertyId);

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

export async function findOrCreateTenantThread(params: {
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
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: winner, error: selectError } = await admin
      .from("inbox_threads")
      .select("id")
      .eq("property_id", params.propertyId)
      .eq("entity_type", "tenant_profile")
      .eq("entity_id", params.recipientProfileId)
      .eq("subject", params.subject)
      .limit(1)
      .maybeSingle();
    return selectError ? null : (winner?.id ?? null);
  }

  if (error || !createdThread?.id) {
    return null;
  }

  return createdThread.id;
}

export async function insertInboxMessage(params: {
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
    direction: params.direction,
  });

  return error;
}

export async function touchInboxThread(threadId: string, userId: string) {
  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();
  let { error: threadUpdateError } = await admin
    .from("inbox_threads")
    .update({ updated_at: updatedAt })
    .eq("id", threadId);

  if (threadUpdateError) {
    console.error("inbox_thread_touch_failed", { userId, threadId, category: "update_error" });

    const retryResult = await admin
      .from("inbox_threads")
      .update({ updated_at: updatedAt })
      .eq("id", threadId);
    threadUpdateError = retryResult.error;
  }

  if (threadUpdateError) {
    console.error("inbox_thread_touch_failed", { userId, threadId, category: "retry_error" });
  }

  return threadUpdateError;
}

export async function loadOwnerRecipients(
  propertyId: string,
  excludeProfileId?: string | null,
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
    name: getProfileDisplayName(profile, "Owner"),
  }));
}

export async function notifyTenantOfDirectMessage(params: {
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
    dashboardUrl: `${appUrl}/tenant?section=notifications`,
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
    emailContent: email,
  });
}

export async function notifyOwnersOfTenantReply(params: {
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
          dashboardUrl: `${appUrl}/owner?section=inbox`,
        }),
      }),
    ),
  );
}

export async function loadSenderName(userId: string, fallbackEmail?: string | null) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  return getProfileDisplayName(profile, fallbackEmail ?? "Domus");
}

export async function ensureTenantThreadCapability() {
  const capabilityError = await ensureCapabilityEnabled("inboxThreadsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  return null;
}
