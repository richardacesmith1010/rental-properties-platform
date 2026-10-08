import { createAdminClient } from "@/lib/supabase/admin";
import { assertStripeEligibleAccount, STRIPE_CLIENT_MESSAGE } from "@/lib/client-accounts";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  buildDistributionConfigSnapshot,
  toDistributionMode,
  toNumber
} from "@/lib/distribution-plans";
import type {
  DistributionConfigSnapshot,
  DistributionMode,
  DistributionHistoryEntry,
  DistributionMemberRow,
  DistributionStatus,
  FinancialActivityEvent
} from "@/lib/distribution-plans";
export {
  planEqualDistributionTransfers,
  planCustomDistributionTransfers,
  validateDistributionConfig,
  buildDistributionConfigSnapshot
} from "@/lib/distribution-plans";
export type {
  DistributionHistoryEntry,
  DistributionMemberConfig,
  DistributionConfigSnapshot,
  DistributionMemberRow,
  PlannedDistributionShare,
  FinancialActivityEvent
} from "@/lib/distribution-plans";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

export async function recordPaymentDistribution(params: {
  paymentId: string | null;
  accountId: string;
  profileId: string;
  amountCents: number;
  distributionPct: number | null;
  stripeTransferId: string | null;
  status: DistributionStatus;
}) {
  if (!params.paymentId) {
    return;
  }

  await assertStripeEligibleAccount(params.accountId);

  const admin = createAdminClient();
  const { error } = await admin.from("payment_distributions").insert({
    payment_id: params.paymentId,
    account_id: params.accountId,
    member_profile_id: params.profileId,
    amount_cents: params.amountCents,
    distribution_pct: params.distributionPct,
    stripe_transfer_id: params.stripeTransferId,
    status: params.status
  });
  if (error) {
    console.error("recordPaymentDistribution error:", error);
  }
}

async function getProfilesById(profileIds: string[]) {
  const admin = createAdminClient();
  if (profileIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", profileIds);
  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getProfilesById error:", error);
    }
    return new Map<string, ProfileRow>();
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

export async function getDistributionHistory(
  accountId: string,
  limit = 20
): Promise<DistributionHistoryEntry[]> {
  const admin = createAdminClient();
  const safeLimit = Math.max(1, limit);
  const { data, error } = await admin
    .from("payment_distributions")
    .select(
      "id, payment_id, member_profile_id, amount_cents, distribution_pct, stripe_transfer_id, status, created_at"
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    console.error("getDistributionHistory error:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  const profileMap = await getProfilesById(
    Array.from(new Set(data.map((row) => row.member_profile_id)))
  );

  return data.map((row) => {
    const profile = profileMap.get(row.member_profile_id);
    return {
      id: row.id,
      paymentId: row.payment_id,
      memberProfileId: row.member_profile_id,
      memberName: profile?.full_name ?? "Unknown",
      memberEmail: profile?.email ?? "unknown",
      amountCents: row.amount_cents,
      distributionPct: toNumber(row.distribution_pct),
      stripeTransferId: row.stripe_transfer_id,
      status: row.status as DistributionStatus,
      createdAt: row.created_at
    };
  });
}

export async function getDistributionMembersForAccount(accountId: string): Promise<{
  mode: DistributionMode;
  members: DistributionMemberRow[];
}> {
  const admin = createAdminClient();
  const [accountResult, membersResult] = await Promise.all([
    admin.from("ownership_accounts").select("distribution_mode").eq("id", accountId).maybeSingle(),
    admin
      .from("ownership_account_members")
      .select("profile_id, distribution_pct, payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("active", true)
      .order("created_at", { ascending: true })
  ]);

  if (accountResult.error && !isMissingSchemaError(accountResult.error)) {
    console.error("getDistributionMembersForAccount account error:", accountResult.error);
  }

  let rows = membersResult.data ?? [];
  if (membersResult.error) {
    if (isMissingSchemaError(membersResult.error)) {
      const fallback = await admin
        .from("ownership_account_members")
        .select("profile_id")
        .eq("account_id", accountId)
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (fallback.error && !isMissingSchemaError(fallback.error)) {
        console.error("getDistributionMembersForAccount fallback error:", fallback.error);
      }
      rows = (fallback.data ?? []).map((member) => ({
        profile_id: member.profile_id,
        distribution_pct: null,
        payout_stripe_account_id: null
      }));
    } else {
      console.error("getDistributionMembersForAccount member error:", membersResult.error);
      rows = [];
    }
  }

  return {
    mode: toDistributionMode(accountResult.data?.distribution_mode),
    members: rows.map((member) => ({
      profileId: member.profile_id,
      distributionPct: toNumber(member.distribution_pct),
      payoutStripeAccountId: member.payout_stripe_account_id ?? null
    }))
  };
}

export async function getDistributionConfigSnapshot(
  accountId: string
): Promise<DistributionConfigSnapshot> {
  const { mode, members } = await getDistributionMembersForAccount(accountId);
  return {
    mode,
    members: members.map((member) => ({
      profileId: member.profileId,
      pct: member.distributionPct
    }))
  };
}

export async function applyDistributionConfig(
  accountId: string,
  config: DistributionConfigSnapshot
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await assertStripeEligibleAccount(accountId);
  } catch {
    return { success: false, error: STRIPE_CLIENT_MESSAGE };
  }
  const admin = createAdminClient();
  const activeMembers = await getDistributionMembersForAccount(accountId);
  const activeProfileIds = activeMembers.members.map((member) => member.profileId);

  const targetMembers = buildDistributionConfigSnapshot(
    config.mode,
    activeProfileIds,
    new Map(
      config.members.map((member) => [member.profileId, member.pct ?? 0])
    )
  ).members;

  const memberUpdates = targetMembers.map((member) =>
    admin
      .from("ownership_account_members")
      .update({ distribution_pct: member.pct })
      .eq("account_id", accountId)
      .eq("profile_id", member.profileId)
  );

  const results = await Promise.all([
    ...memberUpdates,
    admin
      .from("ownership_accounts")
      .update({ distribution_mode: config.mode })
      .eq("id", accountId)
  ]);

  const failingResult = results.find((result) => result.error);
  if (failingResult?.error) {
    if (isMissingSchemaError(failingResult.error)) {
      return {
        success: false,
        error: "Distribution settings require a database update before they can be used."
      };
    }
    console.error("applyDistributionConfig error:", failingResult.error);
    return { success: false, error: "Unable to save distribution settings." };
  }

  return { success: true };
}

export async function getFinancialActivityFeed(
  accountId: string,
  limit = 50
): Promise<FinancialActivityEvent[]> {
  const admin = createAdminClient();
  const safeLimit = Math.max(1, limit);

  const [
    distributionsResult,
    configChangesResult,
    withdrawalsResult,
    expensePropertiesResult
  ] = await Promise.all([
    admin
      .from("payment_distributions")
      .select("id, member_profile_id, amount_cents, status, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    admin
      .from("distribution_change_requests")
      .select("id, requested_by, proposed_config, status, created_at")
      .eq("ownership_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    admin
      .from("withdrawal_requests")
      .select("id, requested_by, amount_cents, reason, status, created_at")
      .eq("ownership_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    admin.from("properties").select("id, name").eq("owner_account_id", accountId)
  ]);

  const expenseProperties = expensePropertiesResult.error
    ? []
    : (expensePropertiesResult.data ?? []);
  if (expensePropertiesResult.error && !isMissingSchemaError(expensePropertiesResult.error)) {
    console.error("getFinancialActivityFeed properties error:", expensePropertiesResult.error);
  }

  const propertyIds = expenseProperties.map((property) => property.id);
  const expensesResult = propertyIds.length
    ? await admin
        .from("property_expenses")
        .select("id, property_id, amount_cents, category, description, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false })
        .limit(safeLimit)
    : { data: [], error: null };

  const profileIds = new Set<string>();
  for (const row of distributionsResult.data ?? []) {
    profileIds.add(row.member_profile_id);
  }
  for (const row of configChangesResult.data ?? []) {
    profileIds.add(row.requested_by);
  }
  for (const row of withdrawalsResult.data ?? []) {
    profileIds.add(row.requested_by);
  }
  const profileMap = await getProfilesById(Array.from(profileIds));
  const propertyNameById = new Map(expenseProperties.map((property) => [property.id, property.name]));

  const events: FinancialActivityEvent[] = [];

  if (distributionsResult.error && !isMissingSchemaError(distributionsResult.error)) {
    console.error("getFinancialActivityFeed distributions error:", distributionsResult.error);
  }
  for (const row of distributionsResult.data ?? []) {
    const profile = profileMap.get(row.member_profile_id);
    events.push({
      id: `distribution:${row.id}`,
      type: "distribution",
      title: profile?.full_name
        ? `Distribution to ${profile.full_name}`
        : "Distribution recorded",
      description: profile?.email
        ? `Member transfer recorded for ${profile.email}.`
        : "Member transfer recorded.",
      amountCents: row.amount_cents,
      status: row.status,
      createdAt: row.created_at
    });
  }

  if (configChangesResult.error && !isMissingSchemaError(configChangesResult.error)) {
    console.error("getFinancialActivityFeed config changes error:", configChangesResult.error);
  }
  for (const row of configChangesResult.data ?? []) {
    const proposedMode = toDistributionMode(
      typeof row.proposed_config === "object" && row.proposed_config && "mode" in row.proposed_config
        ? String((row.proposed_config as { mode?: string }).mode)
        : null
    );
    const profile = profileMap.get(row.requested_by);
    events.push({
      id: `config_change:${row.id}`,
      type: "config_change",
      title: "Distribution config change",
      description: `${profile?.full_name ?? "A member"} proposed ${proposedMode.replace(/_/g, " ")}.`,
      amountCents: null,
      status: row.status,
      createdAt: row.created_at
    });
  }

  if (withdrawalsResult.error && !isMissingSchemaError(withdrawalsResult.error)) {
    console.error("getFinancialActivityFeed withdrawals error:", withdrawalsResult.error);
  }
  for (const row of withdrawalsResult.data ?? []) {
    const profile = profileMap.get(row.requested_by);
    events.push({
      id: `withdrawal:${row.id}`,
      type: "withdrawal",
      title: "Withdrawal request",
      description: row.reason?.trim()
        ? `${profile?.full_name ?? "A member"}: ${row.reason.trim()}`
        : `${profile?.full_name ?? "A member"} requested a withdrawal.`,
      amountCents: row.amount_cents,
      status: row.status,
      createdAt: row.created_at
    });
  }

  if (expensesResult.error && !isMissingSchemaError(expensesResult.error)) {
    console.error("getFinancialActivityFeed expenses error:", expensesResult.error);
  }
  for (const row of expensesResult.data ?? []) {
    const propertyName = propertyNameById.get(row.property_id) ?? "Property";
    events.push({
      id: `expense:${row.id}`,
      type: "expense",
      title: `${propertyName} expense`,
      description: row.description?.trim() || `Recorded ${row.category.replace(/_/g, " ")} expense.`,
      amountCents: row.amount_cents,
      status: null,
      createdAt: row.created_at
    });
  }

  return events
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, safeLimit);
}
