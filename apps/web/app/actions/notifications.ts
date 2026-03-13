"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateNotificationPreference } from "@/lib/notification-preferences";
import {
  markNotificationReadSchema,
  parseFormData,
  updateNotificationPreferenceSchema
} from "@/lib/validations";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function markNotificationRead(
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

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(markNotificationReadSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { notificationId } = parsed.data;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_profile_id", user.id);

  if (error) {
    return { success: false, error: "Failed to mark notification as read." };
  }

  revalidatePath("/owner");
  revalidatePath("/tenant");
  revalidatePath("/manager");
  return { success: true };
}

export async function markAllNotificationsRead(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", user.id)
    .is("read_at", null);

  if (error) {
    return { success: false, error: "Failed to mark notifications as read." };
  }

  revalidatePath("/owner");
  revalidatePath("/tenant");
  revalidatePath("/manager");
  return { success: true, message: "All notifications marked read." };
}

export async function saveNotificationPreference(
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

  const parsed = parseFormData(updateNotificationPreferenceSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  try {
    await updateNotificationPreference(
      user.id,
      parsed.data.notificationType,
      parsed.data.emailEnabled ?? false,
      parsed.data.inAppEnabled ?? false
    );
  } catch {
    return { success: false, error: "Failed to update notification preference." };
  }

  revalidatePath("/settings");
  return { success: true, message: "Preference updated." };
}

/* ─── Phase 10: Automations + Inbox + Leasing ─── */
