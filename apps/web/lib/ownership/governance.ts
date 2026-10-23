import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { unique } from "./accounts";
import type {
  GovernanceProfileRow, AccountRenameRequestRow, AccountRenameVoteRow, AccountDeleteRequestRow,
  AccountDeleteVoteRow, AccountRenameRequestDTO, AccountDeleteRequestDTO
} from "./types";

export async function getGovernanceProfileMap(profileIds: string[]) {
  const admin = createAdminClient();
  if (profileIds.length === 0) {
    return new Map<string, GovernanceProfileRow>();
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", unique(profileIds));

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getGovernanceProfileMap error:", error);
    }
    return new Map<string, GovernanceProfileRow>();
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile as GovernanceProfileRow]));
}

export async function getPendingAccountRenameRequests(
  accountIds: string[]
): Promise<AccountRenameRequestDTO[]> {
  const admin = createAdminClient();
  if (accountIds.length === 0) {
    return [];
  }

  const { data: requests, error: requestsError } = await admin
    .from("account_rename_requests")
    .select(
      "id, ownership_account_id, requested_by, proposed_name, current_name, status, votes_required, votes_received, created_at"
    )
    .in("ownership_account_id", unique(accountIds))
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) {
    if (!isMissingSchemaError(requestsError)) {
      console.error("getPendingAccountRenameRequests error:", requestsError);
    }
    return [];
  }

  const requestRows = (requests ?? []) as AccountRenameRequestRow[];
  const requestIds = requestRows.map((request) => request.id);
  const { data: votes, error: votesError } = await admin
    .from("account_rename_votes")
    .select("request_id, voter_id, vote")
    .in("request_id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);

  if (votesError) {
    if (!isMissingSchemaError(votesError)) {
      console.error("getPendingAccountRenameRequests votes error:", votesError);
    }
    return [];
  }

  const voteRows = (votes ?? []) as AccountRenameVoteRow[];
  const profileMap = await getGovernanceProfileMap(requestRows.map((request) => request.requested_by));
  const votesByRequest = new Map<string, AccountRenameVoteRow[]>();
  for (const vote of voteRows) {
    const current = votesByRequest.get(vote.request_id) ?? [];
    current.push(vote);
    votesByRequest.set(vote.request_id, current);
  }

  return requestRows.map((request) => ({
    id: request.id,
    ownershipAccountId: request.ownership_account_id,
    requestedBy: request.requested_by,
    requestedByName: profileMap.get(request.requested_by)?.full_name ?? "Unknown member",
    proposedName: request.proposed_name,
    currentName: request.current_name,
    status: request.status,
    votesRequired: request.votes_required,
    votesReceived: request.votes_received,
    votes: (votesByRequest.get(request.id) ?? []).map((vote) => ({
      voterId: vote.voter_id,
      vote: vote.vote
    })),
    createdAt: request.created_at
  }));
}

export async function getPendingAccountDeleteRequests(
  accountIds: string[]
): Promise<AccountDeleteRequestDTO[]> {
  const admin = createAdminClient();
  if (accountIds.length === 0) {
    return [];
  }

  const { data: requests, error: requestsError } = await admin
    .from("account_delete_requests")
    .select(
      "id, ownership_account_id, requested_by, reason, status, votes_required, votes_received, created_at"
    )
    .in("ownership_account_id", unique(accountIds))
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) {
    if (!isMissingSchemaError(requestsError)) {
      console.error("getPendingAccountDeleteRequests error:", requestsError);
    }
    return [];
  }

  const requestRows = (requests ?? []) as AccountDeleteRequestRow[];
  const requestIds = requestRows.map((request) => request.id);
  const { data: votes, error: votesError } = await admin
    .from("account_delete_votes")
    .select("request_id, voter_id, vote")
    .in("request_id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);

  if (votesError) {
    if (!isMissingSchemaError(votesError)) {
      console.error("getPendingAccountDeleteRequests votes error:", votesError);
    }
    return [];
  }

  const voteRows = (votes ?? []) as AccountDeleteVoteRow[];
  const profileMap = await getGovernanceProfileMap(requestRows.map((request) => request.requested_by));
  const votesByRequest = new Map<string, AccountDeleteVoteRow[]>();
  for (const vote of voteRows) {
    const current = votesByRequest.get(vote.request_id) ?? [];
    current.push(vote);
    votesByRequest.set(vote.request_id, current);
  }

  return requestRows.map((request) => ({
    id: request.id,
    ownershipAccountId: request.ownership_account_id,
    requestedBy: request.requested_by,
    requestedByName: profileMap.get(request.requested_by)?.full_name ?? "Unknown member",
    reason: request.reason,
    status: request.status,
    votesRequired: request.votes_required,
    votesReceived: request.votes_received,
    votes: (votesByRequest.get(request.id) ?? []).map((vote) => ({
      voterId: vote.voter_id,
      vote: vote.vote
    })),
    createdAt: request.created_at
  }));
}
