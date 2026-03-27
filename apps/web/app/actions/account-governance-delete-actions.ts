"use server";

import { getActiveMembers } from "@/lib/ownership-members";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  requestDeleteLlcSchema,
  voteOnDeleteLlcSchema
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import {
  getPendingDeleteRequest,
  getVoteCounts,
  isOwnerAdminMembership,
  loadAccountAndMembership,
  revalidateOwnershipSurfaces,
  SCHEMA_ERROR_MESSAGE,
  updateVotesReceived
} from "./account-governance-setup";
import { deleteGovernedAccount, resolveAccountDeleteRequest } from "./account-governance-delete-support";

export async function requestDeleteLLC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`requestDeleteLLC:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(requestDeleteLlcSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const accountId = parsed.data.accountId;
  const reason = parsed.data.reason ?? null;
  const access = await loadAccountAndMembership(accountId, user.id);
  if ("error" in access) {
    return { success: false, error: access.error };
  }

  if (!isOwnerAdminMembership(access.membership)) {
    return { success: false, error: "Access denied." };
  }

  if (access.account.account_type !== "llc") {
    return { success: false, error: "Individual accounts cannot be deleted." };
  }

  const pendingDelete = await getPendingDeleteRequest(accountId);
  if ("error" in pendingDelete && pendingDelete.error) {
    return { success: false, error: pendingDelete.error };
  }
  if (pendingDelete.requestId) {
    return { success: false, error: "A delete request is already pending for this LLC account." };
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
    const deletionError = await deleteGovernedAccount(accountId);
    if (deletionError) {
      return { success: false, error: deletionError };
    }

    revalidateOwnershipSurfaces();
    return { success: true, message: "LLC account deleted." };
  }

  const votesRequired = Math.ceil(memberResult.members.length / 2);
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("account_delete_requests")
    .insert({
      ownership_account_id: accountId,
      requested_by: user.id,
      reason,
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
    console.error("requestDeleteLLC request error:", requestError);
    return { success: false, error: "Unable to create an LLC delete request right now." };
  }

  const { error: voteError } = await admin.from("account_delete_votes").insert({
    request_id: request.id,
    voter_id: user.id,
    vote: "approve"
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("requestDeleteLLC vote error:", voteError);
    return { success: false, error: "Delete request created, but the initial vote could not be recorded." };
  }

  const resolvedStatus = votesRequired <= 1 ? await resolveAccountDeleteRequest(request.id) : "pending";
  revalidateOwnershipSurfaces();

  if (resolvedStatus === "approved") {
    return { success: true, message: "LLC account deleted." };
  }

  return { success: true, message: "Delete request submitted for member approval." };
}

export async function voteOnDeleteLLC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`voteOnDeleteLLC:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(voteOnDeleteLlcSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const requestId = parsed.data.requestId;
  const vote = parsed.data.vote;
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("account_delete_requests")
    .select("id, ownership_account_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    if (isMissingSchemaError(requestError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    console.error("voteOnDeleteLLC request error:", requestError);
    return { success: false, error: "Unable to load this delete request right now." };
  }

  if (!request) {
    return { success: false, error: "Delete request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, error: "This delete request has already been resolved." };
  }

  const access = await loadAccountAndMembership(request.ownership_account_id, user.id);
  if ("error" in access) {
    return { success: false, error: access.error };
  }
  if (!access.membership?.active) {
    return { success: false, error: "Access denied." };
  }

  const { error: voteError } = await admin.from("account_delete_votes").insert({
    request_id: requestId,
    voter_id: user.id,
    vote
  });

  if (voteError) {
    if (isMissingSchemaError(voteError)) {
      return { success: false, error: SCHEMA_ERROR_MESSAGE };
    }
    if (voteError.code === "23505") {
      return { success: false, error: "You have already voted on this delete request." };
    }
    console.error("voteOnDeleteLLC insert error:", voteError);
    return { success: false, error: "Unable to record your vote right now." };
  }

  const voteCounts = await getVoteCounts("account_delete_votes", requestId);
  if (voteCounts.error) {
    return { success: false, error: voteCounts.error };
  }

  const voteUpdate = await updateVotesReceived("account_delete_requests", requestId, voteCounts.votesReceived);
  if (voteUpdate.error) {
    return { success: false, error: voteUpdate.error };
  }

  const resolvedStatus = await resolveAccountDeleteRequest(requestId);
  revalidateOwnershipSurfaces();

  if (resolvedStatus === "approved") {
    return { success: true, message: "Vote recorded. The LLC account has been deleted." };
  }
  if (resolvedStatus === "rejected") {
    return { success: true, message: "Vote recorded. The LLC delete request has been rejected." };
  }

  return { success: true, message: "Vote recorded." };
}
