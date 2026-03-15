"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDistributionConfigSnapshot,
  getDistributionConfigSnapshot,
  validateDistributionConfig
} from "@/lib/distributions";
import { resolveRequest } from "@/lib/distribution-approvals";
import { notifyAccountMembers } from "@/lib/notifications";
import { getActiveMembers } from "@/lib/ownership-members";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const DISTRIBUTION_MODES = new Set(["retain", "split_equal", "split_custom"]);
const SCHEMA_ERROR_MESSAGE =
  "Distribution approvals require a database update before they can be used.";

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

function describeMode(mode: string) {
  return mode.replace(/_/g, " ");
}

export async function submitDistributionChangeRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`submitDistributionChangeRequest:${user.id}`, 10, 60_000).allowed) {
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

  const memberResult = await getActiveMembers(accountId);
  if ("error" in memberResult) {
    return {
      success: false,
      error:
        memberResult.error === "This feature requires a database update. Please try again later."
          ? SCHEMA_ERROR_MESSAGE
          : memberResult.error
    };
  }

  const activeMemberIds = memberResult.members.map((member) => member.profileId);
  if (activeMemberIds.length === 0) {
    return { success: false, error: "No active members to distribute funds to." };
  }

  const currentConfig = await getDistributionConfigSnapshot(accountId);
  const memberPctResult = buildMemberPctMap(activeMemberIds, formData);
  if ("error" in memberPctResult) {
    return { success: false, error: memberPctResult.error };
  }

  const memberPcts = memberPctResult.memberPcts;
  const validation = validateDistributionConfig(mode, memberPcts);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Invalid configuration." };
  }

  const proposedConfig = buildDistributionConfigSnapshot(
    mode as "retain" | "split_equal" | "split_custom",
    activeMemberIds,
    memberPcts
  );
  const votesRequired = Math.ceil(activeMemberIds.length / 2);
  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from("distribution_change_requests")
    .insert({
      ownership_account_id: accountId,
      requested_by: user.id,
      current_config: currentConfig,
      proposed_config: proposedConfig,
      status: "pending",
      votes_required: votesRequired,
      votes_received: 1
    })
    .select("id")
    .single();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("submitDistributionChangeRequest insert error:", requestError);
    return { success: false, error: "Unable to create a distribution approval request." };
  }

  const { error: voteError } = await admin.from("distribution_change_votes").insert({
    request_id: request.id,
    voter_id: user.id,
    vote: "approve"
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("submitDistributionChangeRequest vote insert error:", voteError);
    return { success: false, error: "Request created, but the initial vote could not be recorded." };
  }

  if (votesRequired === 1) {
    const resolved = await resolveRequest(request.id);
    revalidatePath("/owner");
    if (resolved?.status === "approved") {
      return { success: true, message: "Distribution updated immediately for this solo account." };
    }
    return { success: true, message: "Distribution request created." };
  }

  await notifyAccountMembers({
    accountId,
    type: "distribution_change_requested",
    title: "Distribution change requested",
    body: `A new ${describeMode(mode)} distribution plan is waiting for member approval.`,
    entityType: "distribution_change_request",
    entityId: request.id,
    excludeProfileId: user.id
  });

  revalidatePath("/owner");
  return { success: true, message: "Distribution approval request created." };
}

export async function voteOnDistributionChange(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");

  if (!checkRateLimit(`voteOnDistributionChange:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const requestId = formData.get("requestId");
  const vote = formData.get("vote");

  if (typeof requestId !== "string" || requestId.length === 0) {
    return { success: false, error: "Missing request ID." };
  }

  if (vote !== "approve" && vote !== "reject") {
    return { success: false, error: "Invalid vote." };
  }

  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("distribution_change_requests")
    .select("id, ownership_account_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnDistributionChange request error:", requestError);
    return { success: false, error: "Unable to load this request right now." };
  }

  if (!request) {
    return { success: false, error: "Request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, error: "This request has already been resolved." };
  }

  const canAdmin = await canUserAdministerOwnershipAccount(user.id, request.ownership_account_id);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  const { error: voteError } = await admin.from("distribution_change_votes").insert({
    request_id: requestId,
    voter_id: user.id,
    vote
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    if (voteError.code === "23505") {
      return { success: false, error: "You have already voted on this request." };
    }
    console.error("voteOnDistributionChange insert error:", voteError);
    return { success: false, error: "Unable to record your vote right now." };
  }

  const { data: votes, error: votesError } = await admin
    .from("distribution_change_votes")
    .select("id")
    .eq("request_id", requestId);

  if (votesError) {
    if (isMissingSchemaError(votesError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnDistributionChange count error:", votesError);
    return { success: false, error: "Your vote was recorded, but the request could not be refreshed." };
  }

  const { error: updateError } = await admin
    .from("distribution_change_requests")
    .update({ votes_received: votes?.length ?? 0 })
    .eq("id", requestId);

  if (updateError) {
    if (isMissingSchemaError(updateError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnDistributionChange update error:", updateError);
    return { success: false, error: "Your vote was recorded, but the request tally could not be updated." };
  }

  const resolved = await resolveRequest(requestId);
  revalidatePath("/owner");

  if (resolved?.status === "approved") {
    return { success: true, message: "Vote recorded. The distribution change is now approved." };
  }
  if (resolved?.status === "rejected") {
    return { success: true, message: "Vote recorded. The distribution change has been rejected." };
  }

  return { success: true, message: "Vote recorded." };
}
