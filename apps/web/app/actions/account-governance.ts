"use server";

import { revalidatePath } from "next/cache";
import { getActiveMembers } from "@/lib/ownership-members";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  renameOwnershipAccountSchema,
  requestDeleteLlcSchema,
  voteOnAccountRenameSchema,
  voteOnDeleteLlcSchema
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const SCHEMA_ERROR_MESSAGE =
  "Account rename and delete voting requires a database update before it can be used.";
const OWNER_ADMIN_ROLES = new Set(["owner", "admin"]);

type GovernanceVote = "approve" | "reject";
type GovernanceStatus = "pending" | "approved" | "rejected" | "cancelled";

interface AccountRow {
  id: string;
  account_type: "individual" | "llc";
  display_name: string;
}

interface MembershipRow {
  member_role: string;
  active: boolean;
}

interface RenameRequestRow {
  id: string;
  ownership_account_id: string;
  proposed_name: string;
  current_name: string;
  status: GovernanceStatus;
  votes_required: number;
  votes_received: number;
}

interface DeleteRequestRow {
  id: string;
  ownership_account_id: string;
  status: GovernanceStatus;
  votes_required: number;
  votes_received: number;
}

type PendingRequestLookup =
  | { error: string; requestId?: never }
  | { error?: never; requestId: string | null };

function revalidateOwnershipSurfaces() {
  revalidatePath("/owner");
  revalidatePath("/manager");
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isOwnerAdminMembership(member: MembershipRow | null | undefined) {
  return Boolean(member?.active && OWNER_ADMIN_ROLES.has(member.member_role));
}

async function loadAccountAndMembership(
  accountId: string,
  userId: string
): Promise<
  | { account: AccountRow; membership: MembershipRow | null }
  | { error: string }
> {
  const admin = createAdminClient();
  const [accountSettled, membershipSettled] = await Promise.allSettled([
    admin
      .from("ownership_accounts")
      .select("id, account_type, display_name")
      .eq("id", accountId)
      .maybeSingle(),
    admin
      .from("ownership_account_members")
      .select("member_role, active")
      .eq("account_id", accountId)
      .eq("profile_id", userId)
      .maybeSingle()
  ]);

  if (accountSettled.status === "rejected" || membershipSettled.status === "rejected") {
    if (accountSettled.status === "rejected") {
      console.error("loadAccountAndMembership account error:", accountSettled.reason);
    }
    if (membershipSettled.status === "rejected") {
      console.error("loadAccountAndMembership membership error:", membershipSettled.reason);
    }
    return { error: "Unable to load ownership account access right now." };
  }

  if (accountSettled.value.error) {
    console.error("loadAccountAndMembership account query error:", accountSettled.value.error);
    return { error: "Unable to load the ownership account right now." };
  }

  if (membershipSettled.value.error && !isMissingSchemaError(membershipSettled.value.error)) {
    console.error(
      "loadAccountAndMembership membership query error:",
      membershipSettled.value.error
    );
    return { error: "Unable to verify membership for this account right now." };
  }

  const account = accountSettled.value.data as AccountRow | null;
  const membership = (membershipSettled.value.data as MembershipRow | null) ?? null;

  if (!account) {
    return { error: "Ownership account not found." };
  }

  return { account, membership };
}

async function getPendingRenameRequest(accountId: string): Promise<PendingRequestLookup> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("account_rename_requests")
    .select("id")
    .eq("ownership_account_id", accountId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE } as const;
    }
    console.error("getPendingRenameRequest error:", error);
    return { error: "Unable to check for pending rename requests right now." } as const;
  }

  return { requestId: data?.id ?? null } as const;
}

async function getPendingDeleteRequest(accountId: string): Promise<PendingRequestLookup> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("account_delete_requests")
    .select("id")
    .eq("ownership_account_id", accountId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE } as const;
    }
    console.error("getPendingDeleteRequest error:", error);
    return { error: "Unable to check for pending delete requests right now." } as const;
  }

  return { requestId: data?.id ?? null } as const;
}

async function updateVotesReceived(
  table: "account_rename_requests" | "account_delete_requests",
  requestId: string,
  votesReceived: number
) {
  const admin = createAdminClient();
  const { error } = await admin.from(table).update({ votes_received: votesReceived }).eq("id", requestId);
  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE } as const;
    }
    console.error("updateVotesReceived error:", error);
    return { error: "Your vote was recorded, but the request tally could not be updated." } as const;
  }

  return { error: null } as const;
}

async function getVoteCounts(
  table: "account_rename_votes" | "account_delete_votes",
  requestId: string
) {
  const admin = createAdminClient();
  const { data, error } = await admin.from(table).select("vote").eq("request_id", requestId);

  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: SCHEMA_ERROR_MESSAGE } as const;
    }
    console.error("getVoteCounts error:", error);
    return { error: "Unable to refresh vote totals right now." } as const;
  }

  const votes = (data ?? []) as Array<{ vote: GovernanceVote }>;
  return {
    error: null,
    approveCount: votes.filter((vote) => vote.vote === "approve").length,
    rejectCount: votes.filter((vote) => vote.vote === "reject").length,
    votesReceived: votes.length
  } as const;
}

async function applyApprovedRename(
  requestId: string,
  request: RenameRequestRow,
  votesReceived: number
): Promise<GovernanceStatus | null> {
  const admin = createAdminClient();
  const resolvedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("account_rename_requests")
    .update({ status: "approved", resolved_at: resolvedAt, votes_received: votesReceived })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    if (!isMissingSchemaError(claimError)) {
      console.error("applyApprovedRename claim error:", claimError);
    }
    return null;
  }

  if (!claimed) {
    const { data: current } = await admin
      .from("account_rename_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    return (current?.status as GovernanceStatus | undefined) ?? null;
  }

  const { error: updateError } = await admin
    .from("ownership_accounts")
    .update({ display_name: request.proposed_name })
    .eq("id", request.ownership_account_id);

  if (updateError) {
    console.error("applyApprovedRename update error:", updateError);
    const { error: rollbackError } = await admin
      .from("account_rename_requests")
      .update({ status: "pending", resolved_at: null, votes_received: votesReceived })
      .eq("id", requestId)
      .eq("status", "approved");
    if (rollbackError && !isMissingSchemaError(rollbackError)) {
      console.error("applyApprovedRename rollback error:", rollbackError);
    }
    return null;
  }

  return "approved";
}

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

async function deleteGovernedAccount(accountId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { error: unlinkPropertiesError } = await admin
    .from("properties")
    .update({ owner_account_id: null })
    .eq("owner_account_id", accountId);
  if (unlinkPropertiesError) {
    console.error("deleteGovernedAccount unlink properties error:", unlinkPropertiesError);
    return "Unable to unlink properties from this LLC account.";
  }

  const { error: deleteDistributionsError } = await admin
    .from("payment_distributions")
    .delete()
    .eq("account_id", accountId);
  if (deleteDistributionsError && !isMissingSchemaError(deleteDistributionsError)) {
    console.error(
      "deleteGovernedAccount payment distributions error:",
      deleteDistributionsError
    );
    return "Unable to clear historical distribution records for this LLC account.";
  }

  const { error: deleteMembersError } = await admin
    .from("ownership_account_members")
    .delete()
    .eq("account_id", accountId);
  if (deleteMembersError) {
    console.error("deleteGovernedAccount members error:", deleteMembersError);
    return "Unable to remove LLC members right now.";
  }

  const { error: deleteAccountError } = await admin
    .from("ownership_accounts")
    .delete()
    .eq("id", accountId);
  if (deleteAccountError) {
    console.error("deleteGovernedAccount account error:", deleteAccountError);
    return "Unable to delete this LLC account right now.";
  }

  return null;
}

async function resolveAccountDeleteRequest(requestId: string): Promise<GovernanceStatus | null> {
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("account_delete_requests")
    .select("id, ownership_account_id, status, votes_required, votes_received")
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("resolveAccountDeleteRequest request error:", error);
    }
    return null;
  }

  const requestRow = request as DeleteRequestRow | null;
  if (!requestRow) {
    return null;
  }

  if (requestRow.status !== "pending") {
    return requestRow.status;
  }

  const counts = await getVoteCounts("account_delete_votes", requestId);
  if (counts.error) {
    return null;
  }

  if (counts.approveCount >= requestRow.votes_required) {
    const resolvedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("account_delete_requests")
      .update({ status: "approved", resolved_at: resolvedAt, votes_received: counts.votesReceived })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) {
      if (!isMissingSchemaError(claimError)) {
        console.error("resolveAccountDeleteRequest claim error:", claimError);
      }
      return null;
    }

    if (!claimed) {
      const { data: current } = await admin
        .from("account_delete_requests")
        .select("status")
        .eq("id", requestId)
        .maybeSingle();
      return (current?.status as GovernanceStatus | undefined) ?? "approved";
    }

    const deletionError = await deleteGovernedAccount(requestRow.ownership_account_id);
    if (deletionError) {
      const { error: rollbackError } = await admin
        .from("account_delete_requests")
        .update({ status: "pending", resolved_at: null, votes_received: counts.votesReceived })
        .eq("id", requestId)
        .eq("status", "approved");
      if (rollbackError && !isMissingSchemaError(rollbackError)) {
        console.error("resolveAccountDeleteRequest rollback error:", rollbackError);
      }
      return null;
    }

    return "approved";
  }

  if (counts.rejectCount >= requestRow.votes_required) {
    const { data: updated, error: updateError } = await admin
      .from("account_delete_requests")
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
        console.error("resolveAccountDeleteRequest reject error:", updateError);
      }
      return null;
    }

    if (!updated) {
      const { data: current } = await admin
        .from("account_delete_requests")
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
    const { error } = await admin
      .from("ownership_accounts")
      .update({ display_name: newName })
      .eq("id", accountId);

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
    const { error } = await admin
      .from("ownership_accounts")
      .update({ display_name: newName })
      .eq("id", accountId);

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

  const voteUpdate = await updateVotesReceived(
    "account_rename_requests",
    requestId,
    voteCounts.votesReceived
  );
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

  const voteUpdate = await updateVotesReceived(
    "account_delete_requests",
    requestId,
    voteCounts.votesReceived
  );
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
