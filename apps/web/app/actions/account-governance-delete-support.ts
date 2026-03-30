import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type { DeleteRequestRow, GovernanceStatus } from "./account-governance-setup";
import { getVoteCounts } from "./account-governance-setup";

async function assertAccountMembership(
  accountId: string,
  callerUserId: string,
  roles?: Array<"owner" | "admin" | "member" | "viewer">
) {
  const admin = createAdminClient();
  const membershipQuery = admin
    .from("ownership_account_members")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("profile_id", callerUserId)
    .eq("active", true);
  const { data: membership, error } = roles?.length
    ? await membershipQuery.in("member_role", roles).maybeSingle()
    : await membershipQuery.maybeSingle();

  if (error) {
    throw new Error("Unable to verify delete access for this LLC account.");
  }

  if (!membership) {
    throw new Error("Unauthorized: caller is not allowed to manage this LLC delete request.");
  }
}

export async function deleteGovernedAccount(
  accountId: string,
  callerUserId: string
): Promise<string | null> {
  await assertAccountMembership(accountId, callerUserId, ["owner", "admin"]);

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
    console.error("deleteGovernedAccount payment distributions error:", deleteDistributionsError);
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

  const { error: deleteAccountError } = await admin.from("ownership_accounts").delete().eq("id", accountId);
  if (deleteAccountError) {
    console.error("deleteGovernedAccount account error:", deleteAccountError);
    return "Unable to delete this LLC account right now.";
  }

  return null;
}

export async function resolveAccountDeleteRequest(
  requestId: string,
  callerUserId: string
): Promise<GovernanceStatus | null> {
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("account_delete_requests")
    .select("id, ownership_account_id, requested_by, status, votes_required, votes_received")
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("resolveAccountDeleteRequest request error:", error);
    }
    return null;
  }

  const requestRow = request as (DeleteRequestRow & { requested_by: string | null }) | null;
  if (!requestRow) {
    return null;
  }

  await assertAccountMembership(requestRow.ownership_account_id, callerUserId);

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

    const deletionError = await deleteGovernedAccount(
      requestRow.ownership_account_id,
      requestRow.requested_by ?? callerUserId
    );
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
