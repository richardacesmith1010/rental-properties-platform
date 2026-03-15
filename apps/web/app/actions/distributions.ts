"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDistributionConfig } from "@/lib/distributions";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const DISTRIBUTION_MODES = new Set(["retain", "split_equal", "split_custom"]);
const SCHEMA_ERROR_MESSAGE = "Distribution settings require a database update before they can be used.";

function roundPct(value: number) {
  return Math.round(value * 100) / 100;
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
    .eq("active", true);

  if (membersError) {
    if (isMissingSchemaError(membersError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("updateDistributionConfig members error:", membersError);
    return { success: false, error: "Unable to load account members right now." };
  }

  const activeMembers = members ?? [];

  if (mode === "retain") {
    const [memberUpdate, accountUpdate] = await Promise.all([
      admin
        .from("ownership_account_members")
        .update({ distribution_pct: null })
        .eq("account_id", accountId),
      admin
        .from("ownership_accounts")
        .update({ distribution_mode: "retain" })
        .eq("id", accountId)
    ]);

    if (
      (memberUpdate.error && isMissingSchemaError(memberUpdate.error)) ||
      (accountUpdate.error && isMissingSchemaError(accountUpdate.error))
    ) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }

    if (memberUpdate.error || accountUpdate.error) {
      console.error("updateDistributionConfig retain error:", memberUpdate.error ?? accountUpdate.error);
      return { success: false, error: "Unable to save distribution settings." };
    }

    revalidatePath("/owner");
    return {
      success: true,
      message: "Distribution set to retain all funds in the LLC account."
    };
  }

  if (activeMembers.length === 0) {
    return { success: false, error: "No active members to distribute funds to." };
  }

  if (mode === "split_equal") {
    const equalPct = roundPct(100 / activeMembers.length);
    const firstPct = roundPct(100 - equalPct * (activeMembers.length - 1));
    const updates = activeMembers.map((member, index) =>
      admin
        .from("ownership_account_members")
        .update({ distribution_pct: index === 0 ? firstPct : equalPct })
        .eq("account_id", accountId)
        .eq("profile_id", member.profile_id)
    );

    const results = await Promise.all([
      ...updates,
      admin
        .from("ownership_accounts")
        .update({ distribution_mode: "split_equal" })
        .eq("id", accountId)
    ]);

    const failingResult = results.find((result) => result.error);
    if (failingResult?.error && isMissingSchemaError(failingResult.error)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    if (failingResult?.error) {
      console.error("updateDistributionConfig split_equal error:", failingResult.error);
      return { success: false, error: "Unable to save distribution settings." };
    }

    revalidatePath("/owner");
    return {
      success: true,
      message: `Distribution set to equal split (${activeMembers.length} members).`
    };
  }

  const memberPcts = new Map<string, number>();
  for (const member of activeMembers) {
    const rawPct = formData.get(`pct_${member.profile_id}`);
    const parsedPct = rawPct === null ? 0 : Number.parseFloat(String(rawPct));
    if (Number.isNaN(parsedPct)) {
      return { success: false, error: "Invalid percentage for a member." };
    }
    memberPcts.set(member.profile_id, parsedPct);
  }

  const validation = validateDistributionConfig(mode, memberPcts);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Invalid configuration." };
  }

  const updates = Array.from(memberPcts.entries()).map(([profileId, pct]) =>
    admin
      .from("ownership_account_members")
      .update({ distribution_pct: roundPct(pct) })
      .eq("account_id", accountId)
      .eq("profile_id", profileId)
  );
  const results = await Promise.all([
    ...updates,
    admin
      .from("ownership_accounts")
      .update({ distribution_mode: "split_custom" })
      .eq("id", accountId)
  ]);

  const failingResult = results.find((result) => result.error);
  if (failingResult?.error && isMissingSchemaError(failingResult.error)) {
    return { success: false, error: SCHEMA_ERROR_MESSAGE };
  }
  if (failingResult?.error) {
    console.error("updateDistributionConfig split_custom error:", failingResult.error);
    return { success: false, error: "Unable to save distribution settings." };
  }

  revalidatePath("/owner");
  return { success: true, message: "Custom distribution percentages saved." };
}
