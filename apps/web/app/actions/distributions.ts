"use server";

import { revalidatePath } from "next/cache";
import {
  applyDistributionConfig,
  buildDistributionConfigSnapshot,
  validateDistributionConfig
} from "@/lib/distributions";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const DISTRIBUTION_MODES = new Set(["retain", "split_equal", "split_custom"]);
const SCHEMA_ERROR_MESSAGE = "Distribution settings require a database update before they can be used.";

function buildMemberPctMap(
  profileIds: string[],
  formData: FormData
): { memberPcts: Map<string, number> } | { error: string } {
  const memberPcts = new Map<string, number>();

  for (const profileId of profileIds) {
    const rawPct = formData.get(`pct_${profileId}`);
    const parsedPct = rawPct === null ? 0 : Number.parseFloat(String(rawPct));
    if (Number.isNaN(parsedPct)) {
      return { error: "Invalid percentage for a member." } as const;
    }
    memberPcts.set(profileId, parsedPct);
  }

  return { memberPcts } as const;
}

export async function updateDistributionConfig(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`updateDistributionConfig:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const accountId = formData.get("accountId");
  const mode = formData.get("mode");

  if (typeof accountId !== "string" || accountId.length === 0) {
    return { success: false, error: "Missing account ID." };
  }

  if (typeof mode !== "string" || !DISTRIBUTION_MODES.has(mode)) {
    return { success: false, error: "Invalid distribution mode." };
  }

  const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  const admin = createAdminClient();
  const { data: members, error: membersError } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (membersError) {
    if (isMissingSchemaError(membersError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("updateDistributionConfig members error:", membersError);
    return { success: false, error: "Unable to load account members right now." };
  }

  const activeMemberIds = (members ?? [])
    .map((member) => member.profile_id)
    .filter((profileId): profileId is string => typeof profileId === "string" && profileId.length > 0);
  if (activeMemberIds.length === 0) {
    return { success: false, error: "No active members to distribute funds to." };
  }

  if (activeMemberIds.length >= 2) {
    return {
      success: false,
      error: "This account has multiple members. Distribution changes require approval from other members."
    };
  }

  const memberPctResult = buildMemberPctMap(activeMemberIds, formData);
  if ("error" in memberPctResult) {
    return { success: false, error: memberPctResult.error };
  }

  const validation = validateDistributionConfig(mode, memberPctResult.memberPcts);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Invalid configuration." };
  }

  const applyResult = await applyDistributionConfig(
    accountId,
    buildDistributionConfigSnapshot(
      mode as "retain" | "split_equal" | "split_custom",
      activeMemberIds,
      memberPctResult.memberPcts
    )
  );

  if (!applyResult.success) {
    return { success: false, error: applyResult.error };
  }

  revalidatePath("/owner");
  if (mode === "retain") {
    return {
      success: true,
      message: "Distribution set to retain all funds in the LLC account."
    };
  }
  if (mode === "split_equal") {
    return {
      success: true,
      message: `Distribution set to equal split (${activeMemberIds.length} member).`
    };
  }
  return { success: true, message: "Custom distribution percentages saved." };
}
