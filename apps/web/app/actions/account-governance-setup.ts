import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const SCHEMA_ERROR_MESSAGE =
  "Account rename and delete voting requires a database update before it can be used.";
export const OWNER_ADMIN_ROLES = new Set(["owner", "admin"]);

export type GovernanceVote = "approve" | "reject";
export type GovernanceStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface AccountRow {
  id: string;
  account_type: "individual" | "llc";
  display_name: string;
}

export interface MembershipRow {
  member_role: string;
  active: boolean;
}

export interface RenameRequestRow {
  id: string;
  ownership_account_id: string;
  proposed_name: string;
  current_name: string;
  status: GovernanceStatus;
  votes_required: number;
  votes_received: number;
}

export interface DeleteRequestRow {
  id: string;
  ownership_account_id: string;
  status: GovernanceStatus;
  votes_required: number;
  votes_received: number;
}

export type PendingRequestLookup =
  | { error: string; requestId?: never }
  | { error?: never; requestId: string | null };

export function revalidateOwnershipSurfaces() {
  revalidatePath("/owner");
  revalidatePath("/manager");
}

export function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isOwnerAdminMembership(member: MembershipRow | null | undefined) {
  return Boolean(member?.active && OWNER_ADMIN_ROLES.has(member.member_role));
}

export async function loadAccountAndMembership(
  accountId: string,
  userId: string
): Promise<{ account: AccountRow; membership: MembershipRow | null } | { error: string }> {
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

export async function getPendingRenameRequest(accountId: string): Promise<PendingRequestLookup> {
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

export async function getPendingDeleteRequest(accountId: string): Promise<PendingRequestLookup> {
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

export async function updateVotesReceived(
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

export async function getVoteCounts(
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

export async function applyApprovedRename(
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
