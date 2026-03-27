"use server";

import { getActiveMembers } from "@/lib/ownership-members";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  renameOwnershipAccountSchema,
  voteOnAccountRenameSchema
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import {
  applyApprovedRename,
  getPendingRenameRequest,
  getVoteCounts,
  isOwnerAdminMembership,
  loadAccountAndMembership,
  normalizeName,
  revalidateOwnershipSurfaces,
  SCHEMA_ERROR_MESSAGE,
  updateVotesReceived,
  type GovernanceStatus,
  type RenameRequestRow
} from "./account-governance-setup";

async function resolveAccountRenameRequest(requestId: string): Promise<GovernanceStatus | null> {
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("account_rename_requests")
    .select(
      "id, ownership_account_id, proposed_name, current_name, status, votes_required, votes_received"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("resolveAccountRenameRequest request error:", error);
    }
    return null;
  }

  const requestRow = request as RenameRequestRow | null;
  if (!requestRow) {
    return null;
  }

  if (requestRow.status !== "pending") {
    return requestRow.status;
  }

  const counts = await getVoteCounts("account_rename_votes", requestId);
  if (counts.error) {
    return null;
  }

  if (counts.approveCount >= requestRow.votes_required) {
    return applyApprovedRename(requestId, requestRow, counts.votesReceived);
  }

  if (counts.rejectCount >= requestRow.votes_required) {
    const { data: updated, error: updateError } = await admin
      .from("account_rename_requests")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
        votes_received: counts.votesReceived
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      if (!isMissingSchemaError(updateError)) {
        console.error("resolveAccountRenameRequest reject error:", updateError);
      }
      return null;
    }

    if (!updated) {
      const { data: current } = await admin
        .from("account_rename_requests")
        .select("status")
        .eq("id", requestId)
        .maybeSingle();
      return (current?.status as GovernanceStatus | undefined) ?? null;
    }

    return "rejected";
  }

  return "pending";
}

export async function renameOwnershipAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`renameOwnershipAccount:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(renameOwnershipAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const accountId = parsed.data.accountId;
  const newName = normalizeName(parsed.data.newName);
  const access = await loadAccountAndMembership(accountId, user.id);
  if ("error" in access) {
    return { success: false, error: access.error };
  }

  if (!isOwnerAdminMembership(access.membership)) {
    return { success: false, error: "Access denied." };
  }

  if (newName === access.account.display_name) {
    return { success: false, error: "Enter a different account name." };
  }

  const admin = createAdminClient();

  if (access.account.account_type === "individual") {
    const { error } = await admin.from("ownership_accounts").update({ display_name: newName }).eq("id", accountId);

    if (error) {
      console.error("renameOwnershipAccount individual update error:", error);
      return { success: false, error: "Unable to rename this account right now." };
    }

    revalidateOwnershipSurfaces();
    return { success: true, message: "Account renamed." };
  }

  const pendingRename = await getPendingRenameRequest(accountId);
  if ("error" in pendingRename && pendingRename.error) {
    return { success: false, error: pendingRename.error };
  }
  if (pendingRename.requestId) {
    return { success: false, error: "A rename request is already pending for this LLC account." };
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

  if (memberResult.members.length <= 1) {
    const { error } = await admin.from("ownership_accounts").update({ display_name: newName }).eq("id", accountId);

    if (error) {
      console.error("renameOwnershipAccount solo llc update error:", error);
      return { success: false, error: "Unable to rename this account right now." };
    }

    revalidateOwnershipSurfaces();
    return { success: true, message: "LLC account renamed." };
  }

  const votesRequired = Math.ceil(memberResult.members.length / 2);
  const { data: request, error: requestError } = await admin
    .from("account_rename_requests")
    .insert({
      ownership_account_id: accountId,
      requested_by: user.id,
      proposed_name: newName,
      current_name: access.account.display_name,
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
    console.error("renameOwnershipAccount request error:", requestError);
    return { success: false, error: "Unable to create an LLC rename request right now." };
  }

  const { error: voteError } = await admin.from("account_rename_votes").insert({
    request_id: request.id,
    voter_id: user.id,
    vote: "approve"
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("renameOwnershipAccount vote error:", voteError);
    return { success: false, error: "Rename request created, but the initial vote could not be recorded." };
  }

  const resolvedStatus = votesRequired <= 1 ? await resolveAccountRenameRequest(request.id) : "pending";
  revalidateOwnershipSurfaces();

  if (resolvedStatus === "approved") {
    return { success: true, message: "LLC account renamed." };
  }

  return { success: true, message: "Rename request submitted for member approval." };
}

export async function voteOnAccountRename(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`voteOnAccountRename:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(voteOnAccountRenameSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const requestId = parsed.data.requestId;
  const vote = parsed.data.vote;
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("account_rename_requests")
    .select("id, ownership_account_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnAccountRename request error:", requestError);
    return { success: false, error: "Unable to load this rename request right now." };
  }

  if (!request) {
    return { success: false, error: "Rename request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, error: "This rename request has already been resolved." };
  }

  const access = await loadAccountAndMembership(request.ownership_account_id, user.id);
  if ("error" in access) {
    return { success: false, error: access.error };
  }
  if (!access.membership?.active) {
    return { success: false, error: "Access denied." };
  }

  const { error: voteError } = await admin.from("account_rename_votes").insert({
    request_id: requestId,
    voter_id: user.id,
    vote
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    if (voteError.code === "23505") {
      return { success: false, error: "You have already voted on this rename request." };
    }
    console.error("voteOnAccountRename insert error:", voteError);
    return { success: false, error: "Unable to record your vote right now." };
  }

  const voteCounts = await getVoteCounts("account_rename_votes", requestId);
  if (voteCounts.error) {
    return { success: false, error: voteCounts.error };
  }

  const voteUpdate = await updateVotesReceived("account_rename_requests", requestId, voteCounts.votesReceived);
  if (voteUpdate.error) {
    return { success: false, error: voteUpdate.error };
  }

  const resolvedStatus = await resolveAccountRenameRequest(requestId);
  revalidateOwnershipSurfaces();

  if (resolvedStatus === "approved") {
    return { success: true, message: "Vote recorded. The account rename is now approved." };
  }
  if (resolvedStatus === "rejected") {
    return { success: true, message: "Vote recorded. The account rename has been rejected." };
  }

  return { success: true, message: "Vote recorded." };
}
