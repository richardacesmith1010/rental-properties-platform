"use server";

import { revalidatePath } from "next/cache";
import {
  resolveNotificationPauseUntil,
  setNotificationEmailPause,
  updateNotificationEmailPreference
} from "@/lib/notification-preferences";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  pauseNotificationEmailsSchema,
  resumeNotificationEmailsSchema,
  updateNotificationEmailPreferenceSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

function revalidateNotificationPreferencePaths() {
  revalidatePath("/settings");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
}

function getNotificationPreferenceErrorMessage(error: unknown) {
  if (isMissingSchemaError(error)) {
    return "This feature requires a database update.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to update notification preferences right now.";
}

export async function updateNotificationPreferences(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`updateNotificationPreferences:${user.id}`, 60, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateNotificationEmailPreferenceSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  try {
    await updateNotificationEmailPreference(
      user.id,
      parsed.data.preferenceKey,
      parsed.data.enabled
    );
  } catch (error) {
    return {
      success: false,
      error: getNotificationPreferenceErrorMessage(error)
    };
  }

  revalidateNotificationPreferencePaths();
  return { success: true, message: "Notification preference updated." };
}

export async function pauseNotificationEmails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`pauseNotificationEmails:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(pauseNotificationEmailsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  try {
    await setNotificationEmailPause(
      user.id,
      resolveNotificationPauseUntil(parsed.data.duration)
    );
  } catch (error) {
    return {
      success: false,
      error: getNotificationPreferenceErrorMessage(error)
    };
  }

  revalidateNotificationPreferencePaths();
  return { success: true, message: "Email notifications paused." };
}

export async function resumeNotificationEmails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`resumeNotificationEmails:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(resumeNotificationEmailsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  try {
    await setNotificationEmailPause(user.id, null);
  } catch (error) {
    return {
      success: false,
      error: getNotificationPreferenceErrorMessage(error)
    };
  }

  revalidateNotificationPreferencePaths();
  return { success: true, message: "Email notifications resumed." };
}
