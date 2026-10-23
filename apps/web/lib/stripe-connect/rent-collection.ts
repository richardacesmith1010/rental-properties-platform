import { createAdminClient } from "@/lib/supabase/admin";
import { sideEffectError } from "@/lib/logger";
import { type StripeAccountHealthStatus } from "@/lib/stripe";
import { refreshStaleStripeAccounts } from "./api";

export type RentCollectionConnectTarget = { kind: "account"; accountId: string } | { kind: "profile" };

export interface RentCollectionConnectStatus {
  ok: boolean;
  connected: boolean;
  accounts: Array<{ accountId: string; accountName: string; isConnected: boolean; activePropertyCount: number; propertyNames: string[] }>;
  legacyProfileTarget: boolean;
  profileConnected: boolean;
  targets: RentCollectionConnectTarget[];
  primaryTarget: RentCollectionConnectTarget | null;
}

export interface RentCollectionAuthorityAccountRow {
  id: string;
  display_name: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_status: StripeAccountHealthStatus | null;
  stripe_last_verified_at: string | null;
  created_at: string | null;
}

export interface RentCollectionPropertyRow {
  id: string;
  name: string; owner_account_id: string | null; owner_profile_id: string | null; active: boolean | null;
}

export function buildEmptyRentCollectionConnectStatus(): RentCollectionConnectStatus {
  return {
    ok: false, connected: false, accounts: [], legacyProfileTarget: false,
    profileConnected: false, targets: [], primaryTarget: null
  };
}

export function sortByCreatedAtAndId(
  left: Pick<RentCollectionAuthorityAccountRow, "created_at" | "id">,
  right: Pick<RentCollectionAuthorityAccountRow, "created_at" | "id">
): number {
  const leftCreatedAt = left.created_at ?? "";
  const rightCreatedAt = right.created_at ?? "";
  return leftCreatedAt !== rightCreatedAt ? leftCreatedAt.localeCompare(rightCreatedAt) : left.id.localeCompare(right.id);
}

export function hasCompletedStripeConnection(
  stripeAccountId: string | null | undefined,
  onboardingComplete: boolean | null | undefined
): boolean {
  return Boolean(stripeAccountId && onboardingComplete === true);
}

export async function getRentCollectionAuthorityAccountIds(userId: string): Promise<string[] | null> {
  const admin = createAdminClient();
  const logError = sideEffectError("getRentCollectionAuthorityAccountIds", "query", { userId });
  const [{ data: profile, error: profileError }, { data: members, error: membersError }, { data: createdRows, error: createdError }] =
    await Promise.all([
      admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
      admin
        .from("ownership_account_members")
        .select("account_id")
        .eq("profile_id", userId)
        .eq("member_role", "owner")
        .eq("active", true),
      admin.from("ownership_accounts").select("id").eq("created_by_profile_id", userId)
    ]);

  if (profileError || membersError || createdError) {
    logError(profileError ?? membersError ?? createdError);
    return null;
  }

  if (profile?.role !== "owner") {
    return [];
  }

  return Array.from(
    new Set([...(members ?? []).map((member) => member.account_id), ...(createdRows ?? []).map((account) => account.id)])
  );
}

export async function hasRentCollectionAuthorityForAccount(userId: string, accountId: string): Promise<boolean> {
  const accountIds = await getRentCollectionAuthorityAccountIds(userId);
  return Array.isArray(accountIds) && accountIds.includes(accountId);
}

export function getRentCollectionConnectHref(
  status: Pick<RentCollectionConnectStatus, "ok" | "primaryTarget"> | null | undefined
): string {
  return status?.ok && status.primaryTarget?.kind === "account"
    ? `/connect/onboard?accountId=${encodeURIComponent(status.primaryTarget.accountId)}`
    : "/connect/onboard";
}

export async function getRentCollectionConnectStatus(userId: string): Promise<RentCollectionConnectStatus> {
  const admin = createAdminClient();
  const logError = sideEffectError("getRentCollectionConnectStatus", "query", { userId });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role, stripe_account_id, stripe_onboarding_complete").eq("id", userId).maybeSingle();

  if (profileError) {
    logError(profileError);
    return buildEmptyRentCollectionConnectStatus();
  }

  const profileConnected = hasCompletedStripeConnection(profile?.stripe_account_id, profile?.stripe_onboarding_complete);
  const authorityAccountIds = await getRentCollectionAuthorityAccountIds(userId);
  if (authorityAccountIds === null) {
    return buildEmptyRentCollectionConnectStatus();
  }

  if (profile?.role !== "owner") {
    return {
      ok: true,
      connected: profileConnected,
      accounts: [],
      legacyProfileTarget: false,
      profileConnected,
      targets: [],
      primaryTarget: null
    };
  }

  const [
    { data: accounts, error: accountsError },
    { data: legacyProperties, error: legacyPropertiesError },
    { data: accountProperties, error: accountPropertiesError }
  ] =
    await Promise.all([
      authorityAccountIds.length > 0
        ? admin
            .from("ownership_accounts")
            .select(
              "id, display_name, stripe_account_id, stripe_onboarding_complete, stripe_status, stripe_last_verified_at, created_at"
            )
            .in("id", authorityAccountIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("properties")
        .select("id, name, owner_account_id, owner_profile_id, active")
        .eq("owner_profile_id", userId)
        .is("owner_account_id", null),
      authorityAccountIds.length > 0
        ? admin
            .from("properties")
            .select("id, name, owner_account_id, owner_profile_id, active")
            .in("owner_account_id", authorityAccountIds)
        : Promise.resolve({ data: [], error: null })
    ]);

  if (accountsError || legacyPropertiesError || accountPropertiesError) {
    logError(accountsError ?? legacyPropertiesError ?? accountPropertiesError);
    return buildEmptyRentCollectionConnectStatus();
  }

  const activeLegacyProperties = ((legacyProperties ?? []) as RentCollectionPropertyRow[]).filter((property) => property.active !== false);
  const activeAccountProperties = ((accountProperties ?? []) as RentCollectionPropertyRow[])
    .filter((property) => property.active !== false)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const activePropertyNamesByAccount = new Map<string, string[]>();
  for (const property of activeAccountProperties) {
    if (!property.owner_account_id) {
      continue;
    }
    activePropertyNamesByAccount.set(property.owner_account_id, [
      ...(activePropertyNamesByAccount.get(property.owner_account_id) ?? []),
      property.name
    ]);
  }

  const orderedAccounts = (await refreshStaleStripeAccounts(
    (accounts ?? []) as RentCollectionAuthorityAccountRow[]
  )).sort(sortByCreatedAtAndId);
  const accountStatuses = orderedAccounts.map((account) => {
    const propertyNames = (activePropertyNamesByAccount.get(account.id) ?? []).slice(0, 3);
    const activePropertyCount = activePropertyNamesByAccount.get(account.id)?.length ?? 0;
    return {
      accountId: account.id,
      accountName: account.display_name,
      isConnected: hasCompletedStripeConnection(account.stripe_account_id, account.stripe_onboarding_complete),
      activePropertyCount,
      propertyNames
    };
  });

  const propertyOwningTargets: RentCollectionConnectTarget[] = [];
  const emptyAccountTargets: RentCollectionConnectTarget[] = [];
  for (const account of accountStatuses) {
    if (account.isConnected) {
      continue;
    }
    const target = { kind: "account", accountId: account.accountId } as const;
    if (account.activePropertyCount > 0) {
      propertyOwningTargets.push(target);
    } else {
      emptyAccountTargets.push(target);
    }
  }

  const legacyProfileTarget = activeLegacyProperties.length > 0;
  const targets = [
    ...propertyOwningTargets,
    ...emptyAccountTargets,
    ...(legacyProfileTarget && !profileConnected ? ([{ kind: "profile" }] as const) : [])
  ];
  const connected =
    authorityAccountIds.length === 0 && !legacyProfileTarget ? profileConnected : targets.length === 0;

  return {
    ok: true,
    connected,
    accounts: accountStatuses,
    legacyProfileTarget,
    profileConnected,
    targets,
    primaryTarget: targets[0] ?? null
  };
}
