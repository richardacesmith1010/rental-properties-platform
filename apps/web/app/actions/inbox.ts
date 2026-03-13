"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createInboxThreadSchema,
  sendInboxMessageSchema,
  parseFormData
} from "@/lib/validations";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function createInboxThread(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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
    console.error("Failed to update inbox thread timestamp, retrying once:", threadUpdateError.message);
    const retryResult = await supabase
      .from("inbox_threads")
      .update({ updated_at: updatedAt })
      .eq("id", threadId);
    threadUpdateError = retryResult.error;
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  if (threadUpdateError) {
    console.error("Failed to update inbox thread timestamp after retry:", threadUpdateError.message);
    return {
      success: true,
      message: "Message sent, but the thread activity timestamp is catching up."
    };
  }

  return { success: true };
}
