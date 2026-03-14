"use server";

import { revalidatePath } from "next/cache";
import { logFailedSideEffect } from "@/lib/logger";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createInboxThreadSchema,
  sendInboxMessageSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function createInboxThread(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`createInboxThread:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("inboxThreadsEnabled");
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

export async function sendInboxMessage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`sendInboxMessage:${user.id}`, 60, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("inboxThreadsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendInboxMessageSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { threadId, body } = parsed.data;
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, property_id")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return { success: false, error: "Thread not found." };
  }

  if (!(await canUserAdministerProperty(user.id, thread.property_id))) {
    return { success: false, error: "You do not have access to this thread." };
  }

  const { error: messageError } = await supabase.from("inbox_messages").insert({
    thread_id: threadId,
    sender_profile_id: user.id,
    sender_email: user.email ?? null,
    body,
    channel: "in_app",
    direction: "outbound"
  });

  if (messageError) {
    return { success: false, error: "Failed to send inbox message." };
  }

  const updatedAt = new Date().toISOString();
  let { error: threadUpdateError } = await supabase
    .from("inbox_threads")
    .update({ updated_at: updatedAt })
    .eq("id", threadId);

  if (threadUpdateError) {
    logFailedSideEffect(
      {
        action: "sendInboxMessage",
        operation: "update_thread_timestamp",
        userId: user.id,
        entityType: "inbox_thread",
        entityId: threadId
      },
      threadUpdateError
    );
    const retryResult = await supabase
      .from("inbox_threads")
      .update({ updated_at: updatedAt })
      .eq("id", threadId);
    threadUpdateError = retryResult.error;
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  if (threadUpdateError) {
    logFailedSideEffect(
      {
        action: "sendInboxMessage",
        operation: "update_thread_timestamp_retry",
        userId: user.id,
        entityType: "inbox_thread",
        entityId: threadId
      },
      threadUpdateError
    );
    return {
      success: true,
      message: "Message sent, but the thread activity timestamp is catching up."
    };
  }

  return { success: true };
}
