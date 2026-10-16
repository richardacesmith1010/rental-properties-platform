"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const schema = z.object({
  accountId: z.string().uuid(),
  enabled: z.enum(["true", "false"])
});

export async function setManagerReminderPermission(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner");
  if (!checkRateLimit(`setManagerReminderPermission:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }
  const parsed = schema.safeParse({
    accountId: formData.get("accountId"),
    enabled: formData.get("enabled")
  });
  if (!parsed.success) return { success: false, error: "We could not change this setting." };
  if (role !== "owner") return { success: false, error: "Only the owner can change this." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_managers_can_send_reminders", {
    p_account_id: parsed.data.accountId,
    p_actor_id: user.id,
    p_value: parsed.data.enabled === "true"
  });
  if (error) return { success: false, error: "We could not change this setting." };
  if (data === "not_allowed") return { success: false, error: "Only the owner can change this." };
  if (data !== "ok" && data !== "unchanged") {
    return { success: false, error: "We could not change this setting." };
  }
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { success: true };
}
