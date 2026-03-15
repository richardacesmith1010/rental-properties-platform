import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface OwnershipAccountDTO {
  id: string;
  accountType: "individual" | "llc";
  displayName: string;
  memberCount: number;
  joinCode: string | null;
  stripeConnected: boolean;
  distributionMode: string;
  stripeAccountId?: string | null;
  plaidConnected: boolean;
  bankName: string | null;
  bankMask: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
}

export interface OwnershipMemberDTO {
  profileId: string;
  email: string;
  fullName: string;
  memberRole: "admin" | "owner" | "member" | "viewer";
  active: boolean;
  canReceiveCriticalAlerts: boolean;
  distributionPct: number | null;
  payoutStripeConnected: boolean;
}

interface OwnershipAccountRow {
  id: string;
  account_type: string;
  display_name: string;
  join_code: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  distribution_mode: string | null;
  plaid_account_id: string | null;
  plaid_bank_name: string | null;
  plaid_bank_mask: string | null;
  plaid_balance_cents: number | null;
  plaid_balance_updated_at: string | null;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function getOwnershipAccountsForUser(userId: string): Promise<OwnershipAccountDTO[]> {
  const admin = createAdminClient();

  const propertyAccountIds = await getAdministeredOwnerAccountIds(userId);

  const [{ data: memberRows, error: memberError }, { data: createdRows, error: creatorError }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("profile_id", userId)
      .eq("active", true),
    admin
      .from("ownership_accounts")
      .select("id")
      .eq("created_by_profile_id", userId)
  ]);

  if ((memberError && isMissingSchemaError(memberError)) || (creatorError && isMissingSchemaError(creatorError))) {
    return [];
  }

  const accountIds = unique([
    ...propertyAccountIds,
    ...(memberRows ?? []).map((row) => row.account_id),
    ...(createdRows ?? []).map((row) => row.id)
  ]);

  if (accountIds.length === 0) {
    return [];
  }

  const [{ data: accounts, error: accountsError }, { data: members, error: membersError }] = await Promise.all([
    admin
      .from("ownership_accounts")
      .select(
        "id, account_type, display_name, join_code, stripe_account_id, stripe_onboarding_complete, distribution_mode, plaid_account_id, plaid_bank_name, plaid_bank_mask, plaid_balance_cents, plaid_balance_updated_at"
      )
      .in("id", accountIds)
      .order("created_at", { ascending: true }),
    admin
      .from("ownership_account_members")
      .select("account_id")
      .in("account_id", accountIds)
      .eq("active", true)
  ]);

  if (membersError && isMissingSchemaError(membersError)) {
    return [];
  }

  const accountRows: OwnershipAccountRow[] =
    accountsError && isMissingSchemaError(accountsError)
      ? (
          await admin
            .from("ownership_accounts")
            .select(
              "id, account_type, display_name, join_code, stripe_account_id, stripe_onboarding_complete, distribution_mode"
            )
            .in("id", accountIds)
            .order("created_at", { ascending: true })
        ).data?.map((account) => ({
          ...account,
          stripe_account_id: account.stripe_account_id ?? null,
          stripe_onboarding_complete: account.stripe_onboarding_complete ?? false,
          distribution_mode: account.distribution_mode ?? "retain",
          plaid_account_id: null,
          plaid_bank_name: null,
          plaid_bank_mask: null,
          plaid_balance_cents: null,
          plaid_balance_updated_at: null
        })) ?? []
      : ((accounts ?? []) as OwnershipAccountRow[]);

  const memberCountByAccount = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByAccount.set(
      row.account_id,
      (memberCountByAccount.get(row.account_id) ?? 0) + 1
    );
  }

  return accountRows.map((account) => ({
    id: account.id,
    accountType: account.account_type as "individual" | "llc",
    displayName: account.display_name,
    memberCount: memberCountByAccount.get(account.id) ?? 0,
    joinCode: account.join_code ?? null,
    stripeConnected: account.stripe_onboarding_complete === true,
    distributionMode: account.distribution_mode ?? "retain",
    stripeAccountId: account.stripe_account_id ?? null,
    plaidConnected: Boolean(account.plaid_account_id),
    bankName: account.plaid_bank_name ?? null,
    bankMask: account.plaid_bank_mask ?? null,
    balanceCents: account.plaid_balance_cents ?? null,
    balanceUpdatedAt: account.plaid_balance_updated_at ?? null
  }));
}

export async function findAccountByJoinCode(
  joinCode: string
): Promise<{ id: string; displayName: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ownership_accounts")
    .select("id, display_name")
    .eq("join_code", joinCode)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    displayName: data.display_name
  };
}

export async function getOwnershipMembersForAccount(
  userId: string,
  accountId: string
): Promise<OwnershipMemberDTO[]> {
  const canAccessAccount = await canUserAdministerOwnershipAccount(userId, accountId);
  if (!canAccessAccount) {
    return [];
  }

  const admin = createAdminClient();
  const membersQuery = await admin
    .from("ownership_account_members")
    .select("profile_id, member_role, active, can_receive_critical_alerts, distribution_pct, payout_stripe_account_id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const members =
    membersQuery.error && isMissingSchemaError(membersQuery.error)
      ? (
          await admin
            .from("ownership_account_members")
            .select("profile_id, member_role, active, can_receive_critical_alerts")
            .eq("account_id", accountId)
            .order("created_at", { ascending: true })
        ).data?.map((member) => ({
          ...member,
          distribution_pct: null,
          payout_stripe_account_id: null
        })) ?? []
      : (membersQuery.data ?? []);

  if (!members) {
    return [];
  }

  const profileIds = members.map((member) => member.profile_id);
  if (profileIds.length === 0) {
    return [];
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", profileIds);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (members ?? []).map((member) => {
    const profile = profileById.get(member.profile_id);
    return {
      profileId: member.profile_id,
      email: profile?.email ?? "unknown",
      fullName: profile?.full_name ?? "Unknown",
      memberRole: member.member_role as OwnershipMemberDTO["memberRole"],
      active: member.active,
      canReceiveCriticalAlerts: member.can_receive_critical_alerts,
      distributionPct:
        member.distribution_pct === null || member.distribution_pct === undefined
          ? null
          : Number(member.distribution_pct),
      payoutStripeConnected: Boolean(member.payout_stripe_account_id)
    };
  });
}

export async function getOrCreateIndividualOwnershipAccount(
  userId: string,
  fallbackDisplayName = "Individual Account"
): Promise<string> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("ownership_accounts")
    .select("id")
    .eq("account_type", "individual")
    .eq("created_by_profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError && isMissingSchemaError(existingError)) {
    throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
  }

  if (existing?.id) {
    await admin.from("ownership_account_members").upsert(
      {
        account_id: existing.id,
        profile_id: userId,
        member_role: "owner",
        active: true,
        can_receive_critical_alerts: true
      },
      { onConflict: "account_id,profile_id" }
    );
    return existing.id;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const displayName =
    profile?.full_name && profile.full_name.trim().length > 0
      ? `${profile.full_name.trim()} Account`
      : fallbackDisplayName;

  const { data: created, error } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: "individual",
      display_name: displayName,
      created_by_profile_id: userId
    })
    .select("id")
    .single();

  if (error && isMissingSchemaError(error)) {
    throw new Error("Ownership accounts are not enabled yet. Run the Phase 9 migration first.");
  }

  if (error || !created?.id) {
    throw new Error("Failed to create ownership account.");
  }

  await admin.from("ownership_account_members").insert({
    account_id: created.id,
    profile_id: userId,
    member_role: "owner",
    active: true,
    can_receive_critical_alerts: true
  });

  return created.id;
}

export async function canUserAdministerOwnershipAccount(
  userId: string,
  accountId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const [{ data: member, error: memberError }, { data: creator, error: creatorError }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("account_id", accountId)
      .eq("profile_id", userId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("ownership_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("created_by_profile_id", userId)
      .maybeSingle()
  ]);

  if ((memberError && isMissingSchemaError(memberError)) || (creatorError && isMissingSchemaError(creatorError))) {
    return false;
  }

  return Boolean(member?.account_id || creator?.id);
}
