"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/app/actions/auth-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const SAVE_ERROR = "We could not save this. Please try again.";

export async function getAskDomusConsent(): Promise<{ enabled: boolean; error?: string }> {
  const { user } = await requireAuth("owner", "manager");
  try {
    const { data, error } = await createAdminClient().from("profiles")
      .select("ai_consent_at").eq("id", user.id).single();
    if (error) return { enabled: false, error: "We could not check this. Please try again." };
    return { enabled: Boolean(data?.ai_consent_at) };
  } catch {
    return { enabled: false, error: "We could not check this. Please try again." };
  }
}

export async function setAskDomusConsent(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAuth("owner", "manager");
  if (!z.boolean().safeParse(enabled).success) return { success: false, error: SAVE_ERROR };
  if (!checkRateLimit(`askDomusConsent:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: SAVE_ERROR };
  }

  try {
    const { data, error } = await createAdminClient().from("profiles")
      .update({ ai_consent_at: enabled ? new Date().toISOString() : null })
      .eq("id", user.id)
      .select("id");
    if (error || data?.length !== 1 || data[0]?.id !== user.id) return { success: false, error: SAVE_ERROR };
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { success: false, error: SAVE_ERROR };
  }
}
