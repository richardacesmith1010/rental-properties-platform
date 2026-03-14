"use server";

import { revalidatePath } from "next/cache";
import { updateNotificationPreference } from "@/lib/notification-preferences";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  markNotificationReadSchema,
  parseFormData,
  updateNotificationPreferenceSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function markNotificationRead(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`markNotificationRead:${user.id}`, 60, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`markAllNotificationsRead:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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
  const { user } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`saveNotificationPreference:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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
