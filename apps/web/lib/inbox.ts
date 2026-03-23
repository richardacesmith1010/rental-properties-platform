import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export interface InboxMessageDTO {
  id: string;
  threadId: string;
  senderProfileId: string | null;
  senderEmail: string | null;
  body: string;
  channel: "in_app" | "email" | "sms" | "system";
  direction: "inbound" | "outbound" | "system";
  createdAt: string;
}

export interface InboxThreadDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  entityType: string;
  entityId: string | null;
  subject: string;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
  latestMessagePreview: string | null;
  messageCount: number;
  messages: InboxMessageDTO[];
}

interface EnsureInboxThreadParams {
  propertyId: string;
  entityType: string;
  entityId?: string | null;
  subject: string;
  messageBody: string;
  actorProfileId?: string | null;
}

async function resolveThreadActorProfileId(propertyId: string, actorProfileId?: string | null) {
  const admin = createAdminClient();

  if (actorProfileId) {
    const { data: actor } = await admin
      .from("profiles")
      .select("id")
      .eq("id", actorProfileId)
      .maybeSingle();

    if (actor?.id) {
      return actor.id;
    }
  }

  const { data: property } = await admin
    .from("properties")
    .select("owner_account_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (property?.owner_account_id) {
    const { data: ownerMember } = await admin
      .from("ownership_account_members")
      .select("profile_id")
      .eq("account_id", property.owner_account_id)
      .eq("member_role", "owner")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (ownerMember?.profile_id) {
      return ownerMember.profile_id;
    }
  }

  const { data: manager } = await admin
    .from("property_managers")
    .select("manager_profile_id")
    .eq("property_id", propertyId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return manager?.manager_profile_id ?? null;
}

export async function ensureInboxThreadForEvent(params: EnsureInboxThreadParams) {
  const admin = createAdminClient();

  try {
    const actorProfileId = await resolveThreadActorProfileId(params.propertyId, params.actorProfileId);
    if (!actorProfileId) {
      return;
    }

    const entityId = params.entityId ?? null;

    const existingThreadQuery = entityId
      ? admin
          .from("inbox_threads")
          .select("id")
          .eq("property_id", params.propertyId)
          .eq("entity_type", params.entityType)
          .eq("entity_id", entityId)
          .limit(1)
          .maybeSingle()
      : admin
          .from("inbox_threads")
          .select("id")
          .eq("property_id", params.propertyId)
          .eq("entity_type", params.entityType)
          .eq("subject", params.subject)
          .limit(1)
          .maybeSingle();

    const { data: existingThread, error: existingThreadError } = await existingThreadQuery;
    if (existingThreadError && isMissingSchemaError(existingThreadError)) {
      return;
    }

    let threadId = existingThread?.id ?? null;

    if (!threadId) {
      const { data: createdThread, error: threadInsertError } = await admin
        .from("inbox_threads")
        .insert({
          property_id: params.propertyId,
          entity_type: params.entityType,
          entity_id: entityId,
          subject: params.subject,
          created_by_profile_id: actorProfileId,
          updated_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (threadInsertError) {
        return;
      }

      threadId = createdThread?.id ?? null;
    }

    if (!threadId) {
      return;
    }

    const senderProfileId = params.actorProfileId ?? actorProfileId;

    await admin.from("inbox_messages").insert({
      thread_id: threadId,
      sender_profile_id: senderProfileId,
      sender_email: null,
      body: params.messageBody,
      channel: "system",
      direction: "system"
    });

    await admin
      .from("inbox_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);
  } catch (error) {
    console.error("Failed to ensure inbox thread for event:", error);
  }
}

async function getTenantVisiblePropertyIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: leases, error: leaseError } = await admin
    .from("leases")
    .select("unit_id")
    .eq("tenant_profile_id", userId)
    .eq("active", true);

  if (leaseError && isMissingSchemaError(leaseError)) {
    return [];
  }

  const unitIds = unique((leases ?? []).map((lease) => lease.unit_id).filter(Boolean));
  if (unitIds.length === 0) {
    return [];
  }

  const { data: units, error: unitError } = await admin
    .from("units")
    .select("property_id")
    .in("id", unitIds);

  if (unitError && isMissingSchemaError(unitError)) {
    return [];
  }

  return unique((units ?? []).map((unit) => unit.property_id).filter(Boolean));
}

export async function getInboxThreadsForUser(userId: string): Promise<InboxThreadDTO[]> {
  const admin = createAdminClient();
  const role = await getCurrentUserRole(userId);
  const propertyIds =
    role === "tenant"
      ? await getTenantVisiblePropertyIds(userId)
      : await getAdministeredPropertyIds(userId, admin);

  if (propertyIds.length === 0) {
    return [];
  }

  let threadQuery = admin
    .from("inbox_threads")
    .select("id, property_id, entity_type, entity_id, subject, created_by_profile_id, created_at, updated_at")
    .in("property_id", propertyIds)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (role === "tenant") {
    threadQuery = threadQuery
      .eq("entity_type", "tenant_profile")
      .eq("entity_id", userId);
  }

  const { data: threads, error: threadError } = await threadQuery;

  if (threadError && isMissingSchemaError(threadError)) {
    return [];
  }

  const threadRows = threads ?? [];
  if (threadRows.length === 0) {
    return [];
  }

  const threadIds = threadRows.map((thread) => thread.id);

  const [{ data: messages, error: messageError }, { data: properties }] = await Promise.all([
    admin
      .from("inbox_messages")
      .select("id, thread_id, sender_profile_id, sender_email, body, channel, direction, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("properties")
      .select("id, name")
      .in("id", Array.from(new Set(threadRows.map((thread) => thread.property_id))))
  ]);

  if (messageError && isMissingSchemaError(messageError)) {
    return [];
  }

  const messagesByThreadId = new Map<string, InboxMessageDTO[]>();

  for (const message of messages ?? []) {
    const mapped: InboxMessageDTO = {
      id: message.id,
      threadId: message.thread_id,
      senderProfileId: message.sender_profile_id,
      senderEmail: message.sender_email,
      body: message.body,
      channel: message.channel as InboxMessageDTO["channel"],
      direction: message.direction as InboxMessageDTO["direction"],
      createdAt: message.created_at
    };

    const existing = messagesByThreadId.get(mapped.threadId) ?? [];
    existing.push(mapped);
    messagesByThreadId.set(mapped.threadId, existing);
  }

  const propertyNameById = new Map((properties ?? []).map((property) => [property.id, property.name]));

  return threadRows.map((thread) => {
    const threadMessages = (messagesByThreadId.get(thread.id) ?? []).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
    const latestMessage = threadMessages[threadMessages.length - 1];

    return {
      id: thread.id,
      propertyId: thread.property_id,
      propertyName: propertyNameById.get(thread.property_id) ?? "Property",
      entityType: thread.entity_type,
      entityId: thread.entity_id,
      subject: thread.subject,
      createdByProfileId: thread.created_by_profile_id,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      latestMessagePreview: latestMessage?.body ?? null,
      messageCount: threadMessages.length,
      messages: threadMessages
    };
  });
}
