import {
  applyDistributionConfig,
  type DistributionConfigSnapshot,
  getDistributionConfigSnapshot
} from "@/lib/distributions";
import { notifyAccountMembers } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface DistributionChangeRequestDTO {
  id: string;
  ownershipAccountId: string;
  requestedBy: string;
  requestedByName: string | null;
  currentConfig: DistributionConfigSnapshot;
  proposedConfig: DistributionConfigSnapshot;
  status: "pending" | "approved" | "rejected" | "cancelled";
  votesRequired: number;
  votesReceived: number;
  votes: Array<{
    voterId: string;
    voterName: string | null;
    vote: "approve" | "reject";
  }>;
  createdAt: string;
  resolvedAt: string | null;
}

interface VoteRow {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

interface RequestRow {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  current_config: unknown;
  proposed_config: unknown;
  status: DistributionChangeRequestDTO["status"];
  votes_required: number;
  votes_received: number;
  created_at: string;
  resolved_at: string | null;
}

function isDistributionMode(value: string): value is DistributionConfigSnapshot["mode"] {
  return value === "retain" || value === "split_equal" || value === "split_custom";
}

function parseDistributionConfig(value: unknown): DistributionConfigSnapshot {
  if (!value || typeof value !== "object") {
    return { mode: "retain", members: [] };
  }

  const candidate = value as {
    mode?: string;
    members?: Array<{ profileId?: string; pct?: number | string | null }>;
  };
  const rawMode = candidate.mode;
  const mode: DistributionConfigSnapshot["mode"] =
    rawMode && isDistributionMode(rawMode) ? rawMode : "retain";
  const members = Array.isArray(candidate.members)
    ? candidate.members
        .filter((member) => typeof member.profileId === "string" && member.profileId.length > 0)
        .map((member) => ({
          profileId: member.profileId as string,
          pct:
            member.pct === null || member.pct === undefined
              ? null
              : Number.isFinite(Number(member.pct))
                ? Number(member.pct)
                : null
        }))
    : [];

  return { mode, members };
}

async function getProfiles(profileIds: string[]) {
  const admin = createAdminClient();
  if (profileIds.length === 0) {
    return new Map<string, { full_name: string | null; email: string | null }>();
  }

  const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", profileIds);
  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getProfiles distribution approvals error:", error);
    }
    return new Map<string, { full_name: string | null; email: string | null }>();
  }

  return new Map(
    (data ?? []).map((profile) => [
      profile.id,
      { full_name: profile.full_name, email: profile.email }
    ])
  );
}

export async function getVotesForRequest(requestId: string): Promise<DistributionChangeRequestDTO["votes"]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("distribution_change_votes")
    .select("request_id, voter_id, vote")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getVotesForRequest error:", error);
    }
    return [];
  }

  const votes = (data ?? []) as VoteRow[];
  const profileMap = await getProfiles(Array.from(new Set(votes.map((vote) => vote.voter_id))));

  return votes.map((vote) => ({
    voterId: vote.voter_id,
    voterName: profileMap.get(vote.voter_id)?.full_name ?? null,
    vote: vote.vote
  }));
}

export async function getPendingChangeRequests(
  accountId: string
): Promise<DistributionChangeRequestDTO[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("distribution_change_requests")
    .select(
      "id, ownership_account_id, requested_by, current_config, proposed_config, status, votes_required, votes_received, created_at, resolved_at"
    )
    .eq("ownership_account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    console.error("getPendingChangeRequests error:", error);
    return [];
  }

  const rows = (data ?? []) as RequestRow[];
  if (rows.length === 0) {
    return [];
  }

  const requestIds = rows.map((row) => row.id);
  const voterQuery = await admin
    .from("distribution_change_votes")
    .select("request_id, voter_id, vote")
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });

  if (voterQuery.error && !isMissingSchemaError(voterQuery.error)) {
    console.error("getPendingChangeRequests votes error:", voterQuery.error);
  }

  const votes = (voterQuery.data ?? []) as VoteRow[];
  const profileIds = Array.from(
    new Set([
      ...rows.map((row) => row.requested_by),
      ...votes.map((vote) => vote.voter_id)
    ])
  );
  const profileMap = await getProfiles(profileIds);
  const votesByRequestId = new Map<string, DistributionChangeRequestDTO["votes"]>();

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
    currentConfig: parseDistributionConfig(row.current_config),
    proposedConfig: parseDistributionConfig(row.proposed_config),
    status: row.status,
    votesRequired: row.votes_required,
    votesReceived: row.votes_received,
    votes: votesByRequestId.get(row.id) ?? [],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  }));
}

export async function resolveRequest(
  requestId: string
): Promise<DistributionChangeRequestDTO | null> {
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("distribution_change_requests")
    .select(
      "id, ownership_account_id, requested_by, current_config, proposed_config, status, votes_required, votes_received, created_at, resolved_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    if (!isMissingSchemaError(requestError)) {
      console.error("resolveRequest request error:", requestError);
    }
    return null;
  }

  if (!request) {
    return null;
  }

  const requestRow = request as RequestRow;
  const votes = await getVotesForRequest(requestId);
  const approveCount = votes.filter((vote) => vote.vote === "approve").length;
  const rejectCount = votes.filter((vote) => vote.vote === "reject").length;
  const profileMap = await getProfiles([requestRow.requested_by]);

  let nextStatus = requestRow.status;
  if (requestRow.status === "pending" && approveCount >= requestRow.votes_required) {
    const applyResult = await applyDistributionConfig(
      requestRow.ownership_account_id,
      parseDistributionConfig(requestRow.proposed_config)
    );
    if (!applyResult.success) {
      console.error("resolveRequest applyDistributionConfig error:", applyResult.error);
      return null;
    }
    nextStatus = "approved";
  } else if (requestRow.status === "pending" && rejectCount >= requestRow.votes_required) {
    nextStatus = "rejected";
  }

  let resolvedAt = requestRow.resolved_at;
  if (nextStatus !== requestRow.status) {
    resolvedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("distribution_change_requests")
      .update({ status: nextStatus, resolved_at: resolvedAt, votes_received: votes.length })
      .eq("id", requestId);

    if (updateError) {
      if (!isMissingSchemaError(updateError)) {
        console.error("resolveRequest update error:", updateError);
      }
      return null;
    }

    const requestorName = profileMap.get(requestRow.requested_by)?.full_name ?? "A member";
    const title =
      nextStatus === "approved"
        ? "Distribution change approved"
        : "Distribution change rejected";
    const body =
      nextStatus === "approved"
        ? `${requestorName}'s distribution update has been approved and applied.`
        : `${requestorName}'s distribution update was rejected.`;

    await notifyAccountMembers({
      accountId: requestRow.ownership_account_id,
      type:
        nextStatus === "approved"
          ? "distribution_change_approved"
          : "distribution_change_rejected",
      title,
      body,
      entityType: "distribution_change_request",
      entityId: requestId
    });
  }

  return {
    id: requestRow.id,
    ownershipAccountId: requestRow.ownership_account_id,
    requestedBy: requestRow.requested_by,
    requestedByName: profileMap.get(requestRow.requested_by)?.full_name ?? null,
    currentConfig: parseDistributionConfig(requestRow.current_config),
    proposedConfig: parseDistributionConfig(requestRow.proposed_config),
    status: nextStatus,
    votesRequired: requestRow.votes_required,
    votesReceived: votes.length,
    votes,
    createdAt: requestRow.created_at,
    resolvedAt
  };
}

export async function getCurrentDistributionConfigForAccount(
  accountId: string
): Promise<DistributionConfigSnapshot> {
  return getDistributionConfigSnapshot(accountId);
}
