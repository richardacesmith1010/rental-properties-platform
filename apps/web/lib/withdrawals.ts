import { sideEffectError } from "@/lib/logger";
import { notifyAccountMembers } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface WithdrawalRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string | null;
  amountCents: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "completed" | "executing" | "failed";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{ voterId: string; voterName: string | null; vote: "approve" | "reject" }>;
  createdAt: string;
  resolvedAt: string | null;
  stripeTransferId: string | null;
}

interface WithdrawalRow {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  amount_cents: number;
  reason: string | null;
  status: WithdrawalRequestDTO["status"];
  votes_required: number;
  votes_received: number;
  created_at: string;
  resolved_at: string | null;
  stripe_transfer_id: string | null;
}

interface LegacyWithdrawalRow {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  amount_cents: number;
  reason: string | null;
  status: WithdrawalRequestDTO["status"];
  votes_required: number;
  votes_received: number;
  created_at: string;
  resolved_at: string | null;
}

interface WithdrawalVoteRow {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

interface QueryError {
  code?: string;
  message?: string;
}

const WITHDRAWAL_SELECT =
  "id, ownership_account_id, requested_by, amount_cents, reason, status, votes_required, votes_received, created_at, resolved_at, stripe_transfer_id";
const LEGACY_WITHDRAWAL_SELECT =
  "id, ownership_account_id, requested_by, amount_cents, reason, status, votes_required, votes_received, created_at, resolved_at";

function normalizeWithdrawalRow(row: WithdrawalRow | LegacyWithdrawalRow): WithdrawalRow {
  return {
    ...row,
    stripe_transfer_id: "stripe_transfer_id" in row ? row.stripe_transfer_id ?? null : null
  };
}

async function getProfiles(profileIds: string[]) {
  const admin = createAdminClient();
  if (profileIds.length === 0) {
    return new Map<string, { full_name: string | null }>();
  }

  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", profileIds);
  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getProfiles withdrawals error:", error);
    }
    return new Map<string, { full_name: string | null }>();
  }

  return new Map((data ?? []).map((profile) => [profile.id, { full_name: profile.full_name }]));
}

async function getVotes(requestIds: string[]) {
  const admin = createAdminClient();
  if (requestIds.length === 0) {
    return [] as WithdrawalVoteRow[];
  }

  const { data, error } = await admin
    .from("withdrawal_votes")
    .select("request_id, voter_id, vote")
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getVotes withdrawals error:", error);
    }
    return [];
  }

  return (data ?? []) as WithdrawalVoteRow[];
}

async function selectWithdrawalRows(
  accountId: string,
  options?: {
    statuses?: WithdrawalRequestDTO["status"][];
    limit?: number;
  }
): Promise<WithdrawalRow[]> {
  const admin = createAdminClient();
  const runQuery = async (selectClause: string) => {
    let query = admin
      .from("withdrawal_requests")
      .select(selectClause)
      .eq("ownership_account_id", accountId);

    if (options?.statuses && options.statuses.length > 0) {
      query = query.in("status", options.statuses);
    }

    query = query.order("created_at", { ascending: false });

    if (typeof options?.limit === "number") {
      query = query.limit(Math.max(1, options.limit));
    }

    const { data, error } = await query;
    return {
      data: data as (WithdrawalRow | LegacyWithdrawalRow)[] | null,
      error: error as QueryError | null
    };
  };

  let result = await runQuery(WITHDRAWAL_SELECT);

  if (result.error && isMissingSchemaError(result.error)) {
    result = await runQuery(LEGACY_WITHDRAWAL_SELECT);
  }

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return [];
    }
    console.error("selectWithdrawalRows error:", result.error);
    return [];
  }

  return (result.data ?? []).map((row) => normalizeWithdrawalRow(row));
}

async function selectWithdrawalRowById(requestId: string): Promise<WithdrawalRow | null> {
  const admin = createAdminClient();
  let result = await admin
    .from("withdrawal_requests")
    .select(WITHDRAWAL_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (result.error && isMissingSchemaError(result.error)) {
    result = await admin
      .from("withdrawal_requests")
      .select(LEGACY_WITHDRAWAL_SELECT)
      .eq("id", requestId)
      .maybeSingle();
  }

  if (result.error) {
    if (!isMissingSchemaError(result.error)) {
      console.error("selectWithdrawalRowById error:", result.error);
    }
    return null;
  }

  return result.data ? normalizeWithdrawalRow(result.data) : null;
}

function buildWithdrawalDtos(
  rows: WithdrawalRow[],
  votes: WithdrawalVoteRow[],
  profileMap: Map<string, { full_name: string | null }>
): WithdrawalRequestDTO[] {
  const votesByRequestId = new Map<string, WithdrawalRequestDTO["votes"]>();
  for (const vote of votes) {
    const existing = votesByRequestId.get(vote.request_id) ?? [];
    existing.push({
      voterId: vote.voter_id,
      voterName: profileMap.get(vote.voter_id)?.full_name ?? null,
      vote: vote.vote
    });
    votesByRequestId.set(vote.request_id, existing);
  }

  return rows.map((row) => ({
    id: row.id,
    ownershipAccountId: row.ownership_account_id,
    requestedBy: row.requested_by,
    requestedByName: profileMap.get(row.requested_by)?.full_name ?? null,
    amountCents: row.amount_cents,
    reason: row.reason,
    status: row.status,
    votesRequired: row.votes_required,
    votesReceived: row.votes_received,
    votes: votesByRequestId.get(row.id) ?? [],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    stripeTransferId: row.stripe_transfer_id ?? null
  }));
}

async function buildWithdrawalDtoFromRows(rows: WithdrawalRow[]) {
  if (rows.length === 0) {
    return [] as WithdrawalRequestDTO[];
  }

  const votes = await getVotes(rows.map((row) => row.id));
  const profileMap = await getProfiles(
    Array.from(new Set([...rows.map((row) => row.requested_by), ...votes.map((vote) => vote.voter_id)]))
  );

  return buildWithdrawalDtos(rows, votes, profileMap);
}

export async function getPendingWithdrawals(accountId: string): Promise<WithdrawalRequestDTO[]> {
  const rows = await selectWithdrawalRows(accountId, {
    statuses: ["pending", "approved", "executing", "failed"]
  });
  return buildWithdrawalDtoFromRows(rows);
}

export async function getWithdrawalHistory(
  accountId: string,
  limit = 20
): Promise<WithdrawalRequestDTO[]> {
  const rows = await selectWithdrawalRows(accountId, { limit });
  return buildWithdrawalDtoFromRows(rows);
}

export async function resolveWithdrawal(requestId: string): Promise<WithdrawalRequestDTO | null> {
  const admin = createAdminClient();
  const requestRow = await selectWithdrawalRowById(requestId);

  if (!requestRow) {
    return null;
  }

  const votes = await getVotes([requestId]);
  const profileMap = await getProfiles(
    Array.from(new Set([requestRow.requested_by, ...votes.map((vote) => vote.voter_id)]))
  );
  const approveCount = votes.filter((vote) => vote.vote === "approve").length;
  const rejectCount = votes.filter((vote) => vote.vote === "reject").length;

  let nextStatus = requestRow.status;
  if (requestRow.status === "pending" && approveCount >= requestRow.votes_required) {
    nextStatus = "approved";
  } else if (requestRow.status === "pending" && rejectCount >= requestRow.votes_required) {
    nextStatus = "rejected";
  }

  let resolvedAt = requestRow.resolved_at;
  if (nextStatus !== requestRow.status) {
    resolvedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("withdrawal_requests")
      .update({ status: nextStatus, resolved_at: resolvedAt, votes_received: votes.length })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      if (!isMissingSchemaError(updateError)) {
        console.error("resolveWithdrawal update error:", updateError);
      }
      return null;
    }

    if (!updated) {
      const current = await selectWithdrawalRowById(requestId);
      if (!current) {
        return null;
      }
      return (await buildWithdrawalDtoFromRows([{ ...current, votes_received: votes.length }]))[0] ?? null;
    }

    const requestorName = profileMap.get(requestRow.requested_by)?.full_name ?? "A member";
    void notifyAccountMembers({
      accountId: requestRow.ownership_account_id,
      type: nextStatus === "approved" ? "withdrawal_approved" : "withdrawal_rejected",
      title: nextStatus === "approved" ? "Withdrawal approved" : "Withdrawal rejected",
      body:
        nextStatus === "approved"
          ? `${requestorName}'s withdrawal request has been approved.`
          : `${requestorName}'s withdrawal request was rejected.`,
      entityType: "withdrawal_request",
      entityId: requestId
    }).catch(
      sideEffectError("resolveWithdrawal", "notify_account_members", {
        entityType: "withdrawal_request",
        entityId: requestId
      })
    );
  }

  return (
    buildWithdrawalDtos(
      [
        {
          ...requestRow,
          status: nextStatus,
          votes_received: votes.length,
          resolved_at: resolvedAt
        }
      ],
      votes,
      profileMap
    )[0] ?? null
  );
}
