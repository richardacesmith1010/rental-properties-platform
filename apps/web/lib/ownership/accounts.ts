import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type { OwnershipAccountDTO, OwnershipAccountRow, OwnershipAccountsPayload, ActiveLlcMembershipDTO } from "./types";

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function getUniqueOwnershipJoinCode(maxAttempts = 10): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateJoinCode();
    const existing = await findAccountByJoinCode(candidate);
    if (!existing) {
      return candidate;
    }
  }

  return null;
}

export function assembleOwnershipAccountsPayload(payload: OwnershipAccountsPayload): OwnershipAccountDTO[] {
  const counts = new Map((payload.member_counts ?? []).map(row => [row.account_id, row.member_count]));
  return (payload.accounts ?? []).map(account => ({
    id: account.id,
    accountType: account.account_type as "individual" | "llc",
    displayName: account.display_name,
    memberCount: counts.get(account.id) ?? 0,
    joinCode: account.join_code ?? null,
    stripeConnected: account.stripe_onboarding_complete === true,
    distributionMode: account.distribution_mode ?? "retain",
    stripeAccountId: account.stripe_account_id ?? null,
    stripeStatus: account.stripe_status ?? null,
    plaidConnected: Boolean(account.plaid_account_id),
    bankName: account.plaid_bank_name ?? null,
    bankMask: account.plaid_bank_mask ?? null,
    balanceCents: account.plaid_balance_cents ?? null,
    balanceUpdatedAt: account.plaid_balance_updated_at ?? null
  }));
}

export async function getOwnershipAccountsForUser(userId: string): Promise<OwnershipAccountDTO[]> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin.rpc("ownership_accounts_payload", { p_user_id: userId });
    if (error || !data) {
      const code = /^[A-Z0-9]{5,10}$/.test(error?.code ?? "") ? error!.code : "UNKNOWN";
      const missing = isMissingSchemaError(error) || code === "PGRST202" || code === "42883";
      console.error(missing ? "owner_rpc_fallback_missing" : "owner_rpc_fallback_error", code);
    } else {
      return assembleOwnershipAccountsPayload(data as unknown as OwnershipAccountsPayload);
    }
  } catch (error) {
    const rawCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const code = /^[A-Z0-9]{5,10}$/.test(rawCode) ? rawCode : "UNKNOWN";
    console.error("owner_rpc_fallback_error", code);
  }
  return getOwnershipAccountsForUserLegacy(userId);
}

export async function getOwnershipAccountsForUserLegacy(userId: string): Promise<OwnershipAccountDTO[]> {
  const admin = createAdminClient();

  const [propertyAccountIds, { data: memberRows, error: memberError }, { data: createdRows, error: creatorError }] =
    await Promise.all([
    getAdministeredOwnerAccountIds(userId),
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
  if (memberError || creatorError) {
    console.error("[ownership] Failed to load account access:", memberError ?? creatorError);
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
        "id, account_type, display_name, join_code, stripe_account_id, stripe_onboarding_complete, " +
        "stripe_status, distribution_mode, plaid_account_id, plaid_bank_name, plaid_bank_mask, " +
        "plaid_balance_cents, plaid_balance_updated_at"
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
  if (membersError || (accountsError && !isMissingSchemaError(accountsError))) {
    console.error("[ownership] Failed to load account details:", membersError ?? accountsError);
    return [];
  }

  const fallbackResult = accountsError && isMissingSchemaError(accountsError)
    ? await admin
        .from("ownership_accounts")
        .select("id, account_type, display_name, join_code, stripe_account_id, stripe_onboarding_complete, distribution_mode")
        .in("id", accountIds)
        .order("created_at", { ascending: true })
    : null;
  if (fallbackResult?.error) {
    console.error("[ownership] Failed to load fallback account details:", fallbackResult.error);
    return [];
  }
  const accountRows: OwnershipAccountRow[] =
    fallbackResult
      ? (fallbackResult.data ?? []).map((account) => ({
          ...account,
          stripe_account_id: account.stripe_account_id ?? null,
          stripe_onboarding_complete: account.stripe_onboarding_complete ?? false,
          stripe_status: null,
          distribution_mode: account.distribution_mode ?? "retain",
          plaid_account_id: null,
          plaid_bank_name: null,
          plaid_bank_mask: null,
          plaid_balance_cents: null,
          plaid_balance_updated_at: null
        }))
      : ((accounts ?? []) as unknown as OwnershipAccountRow[]);

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
    stripeStatus: account.stripe_status ?? null,
    plaidConnected: Boolean(account.plaid_account_id),
    bankName: account.plaid_bank_name ?? null,
    bankMask: account.plaid_bank_mask ?? null,
    balanceCents: account.plaid_balance_cents ?? null,
    balanceUpdatedAt: account.plaid_balance_updated_at ?? null
  }));
}

export async function getActiveLlcMembershipsForUser(
  userId: string
): Promise<ActiveLlcMembershipDTO[]> {
  const admin = createAdminClient();

  const membershipRowsResult = await admin
    .from("ownership_account_members")
    .select("account_id, payout_stripe_account_id")
    .eq("profile_id", userId)
    .eq("active", true);

  if (membershipRowsResult.error) {
    throw membershipRowsResult.error;
  }

  const membershipRows = membershipRowsResult.data ?? [];
  const accountIds = unique(membershipRows.map((row) => row.account_id));
  if (accountIds.length === 0) {
    return [];
  }

  const { data: accounts, error: accountsError } = await admin
    .from("ownership_accounts")
    .select("id, display_name, account_type")
    .in("id", accountIds)
    .eq("account_type", "llc")
    .order("created_at", { ascending: true });

  if (accountsError) {
    throw accountsError;
  }

  const membershipByAccountId = new Map(
    membershipRows.map((row) => [row.account_id, row])
  );

  return (accounts ?? []).map((account) => ({
    accountId: account.id,
    accountName: account.display_name,
    payoutStripeConnected: Boolean(
      membershipByAccountId.get(account.id)?.payout_stripe_account_id
    )
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