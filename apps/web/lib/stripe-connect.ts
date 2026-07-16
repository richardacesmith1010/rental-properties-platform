import { createAdminClient } from "@/lib/supabase/admin";
import { sideEffectError } from "@/lib/logger";
import { getManagerFeeForProperty } from "@/lib/payment-fees";
import { getStripeSecretKey } from "@/lib/stripe";

interface StripeAccountResponse {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export interface StripeExpressAccountParams {
  type: "express";
  country: "US";
  capabilities: { card_payments: { requested: true }; transfers: { requested: true } };
  business_profile: { mcc: "6513"; url: string };
}

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

interface RentCollectionAuthorityAccountRow {
  id: string;
  display_name: string; stripe_account_id: string | null; stripe_onboarding_complete: boolean | null; created_at: string | null;
}

interface RentCollectionPropertyRow {
  id: string;
  name: string; owner_account_id: string | null; owner_profile_id: string | null; active: boolean | null;
}

const DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL = "https://domusbase.com";

export function buildExpressAccountParams(url: string): StripeExpressAccountParams {
  return {
    type: "express",
    country: "US",
    capabilities: {
      card_payments: {
        requested: true
      },
      transfers: {
        requested: true
      }
    },
    business_profile: {
      mcc: "6513",
      url
    }
  };
}

export function getDefaultExpressAccountBusinessProfileUrl(): string {
  return DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL;
}

export function buildExpressAccountRequestBody(
  params: StripeExpressAccountParams,
  options?: { email?: string }
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("type", params.type);
  if (options?.email) {
    body.set("email", options.email);
  }
  body.set("country", params.country);
  body.set("capabilities[card_payments][requested]", String(params.capabilities.card_payments.requested));
  body.set("capabilities[transfers][requested]", String(params.capabilities.transfers.requested));
  body.set("business_profile[mcc]", params.business_profile.mcc);
  body.set("business_profile[url]", params.business_profile.url);
  return body;
}

async function stripeConnectRequest<T>(path: string, options?: { method?: "GET" | "POST"; body?: URLSearchParams }) {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: options?.body?.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stripe Connect request failed: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as T;
}

export async function createExpressAccount(email: string): Promise<{ id: string }> {
  const params = buildExpressAccountParams(getDefaultExpressAccountBusinessProfileUrl());
  const body = buildExpressAccountRequestBody(params, { email });

  const account = await stripeConnectRequest<{ id: string }>("/accounts", {
    method: "POST",
    body
  });

  return { id: account.id };
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.set("account", accountId);
  body.set("refresh_url", refreshUrl);
  body.set("return_url", returnUrl);
  body.set("type", "account_onboarding");

  const link = await stripeConnectRequest<{ url: string }>("/account_links", {
    method: "POST",
    body
  });

  return { url: link.url };
}

export async function getAccount(accountId: string): Promise<{
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}> {
  const account = await stripeConnectRequest<StripeAccountResponse>(`/accounts/${accountId}`, {
    method: "GET"
  });

  return {
    id: account.id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted
  };
}

export async function createLoginLink(accountId: string): Promise<{ url: string }> {
  const link = await stripeConnectRequest<{ url: string }>(`/accounts/${accountId}/login_links`, {
    method: "POST",
    body: new URLSearchParams()
  });

  return { url: link.url };
}

async function getConnectedStripeProfile(profileIds: string[]) {
  if (profileIds.length === 0) {
    return [] as Array<{ id: string; stripe_account_id: string | null; stripe_onboarding_complete: boolean | null }>;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .in("id", profileIds);

  return data ?? [];
}

function buildEmptyRentCollectionConnectStatus(): RentCollectionConnectStatus {
  return { ok: false, connected: false, accounts: [], legacyProfileTarget: false, profileConnected: false, targets: [], primaryTarget: null };
}

function sortByCreatedAtAndId(
  left: Pick<RentCollectionAuthorityAccountRow, "created_at" | "id">,
  right: Pick<RentCollectionAuthorityAccountRow, "created_at" | "id">
): number {
  const leftCreatedAt = left.created_at ?? "";
  const rightCreatedAt = right.created_at ?? "";
  return leftCreatedAt !== rightCreatedAt ? leftCreatedAt.localeCompare(rightCreatedAt) : left.id.localeCompare(right.id);
}

function hasCompletedStripeConnection(
  stripeAccountId: string | null | undefined,
  onboardingComplete: boolean | null | undefined
): boolean {
  return Boolean(stripeAccountId && onboardingComplete === true);
}

async function getRentCollectionAuthorityAccountIds(userId: string): Promise<string[] | null> {
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

  const [{ data: accounts, error: accountsError }, { data: legacyProperties, error: legacyPropertiesError }, { data: accountProperties, error: accountPropertiesError }] =
    await Promise.all([
      authorityAccountIds.length > 0
        ? admin
            .from("ownership_accounts")
            .select("id, display_name, stripe_account_id, stripe_onboarding_complete, created_at")
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

  const orderedAccounts = ((accounts ?? []) as RentCollectionAuthorityAccountRow[]).sort(sortByCreatedAtAndId);
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

export async function getOwnerStripeAccountForProperty(propertyId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: property } = await admin
    .from("properties")
    .select("id, owner_account_id, owner_profile_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) {
    return null;
  }

  if (!property.owner_account_id) {
    if (!property.owner_profile_id) {
      return null;
    }

    const [profile] = await getConnectedStripeProfile([property.owner_profile_id]);
    return profile?.stripe_account_id && profile.stripe_onboarding_complete ? profile.stripe_account_id : null;
  }

  const { data: accountStripe, error: accountStripeError } = await admin
    .from("ownership_accounts")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("id", property.owner_account_id)
    .maybeSingle();

  if (
    !accountStripeError &&
    accountStripe?.stripe_account_id &&
    accountStripe.stripe_onboarding_complete
  ) {
    return accountStripe.stripe_account_id;
  }

  const [{ data: account }, { data: members }] = await Promise.all([
    admin
      .from("ownership_accounts")
      .select("created_by_profile_id")
      .eq("id", property.owner_account_id)
      .maybeSingle(),
    admin
      .from("ownership_account_members")
      .select("profile_id")
      .eq("account_id", property.owner_account_id)
      .eq("member_role", "owner")
      .eq("active", true)
  ]);

  const orderedProfileIds = Array.from(
    new Set([
      account?.created_by_profile_id ?? null,
      ...(members ?? []).map((member) => member.profile_id)
    ].filter((value): value is string => Boolean(value)))
  );

  const profiles = await getConnectedStripeProfile(orderedProfileIds);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  for (const profileId of orderedProfileIds) {
    const profile = profileById.get(profileId);
    if (profile?.stripe_account_id && profile.stripe_onboarding_complete) {
      return profile.stripe_account_id;
    }
  }

  // Fallback: check owner_profile_id directly if ownership chain didn't yield a result
  if (property.owner_profile_id) {
    const alreadyChecked = orderedProfileIds.includes(property.owner_profile_id);
    if (!alreadyChecked) {
      const [directProfile] = await getConnectedStripeProfile([property.owner_profile_id]);
      if (directProfile?.stripe_account_id && directProfile.stripe_onboarding_complete) {
        return directProfile.stripe_account_id;
      }
    }
  }

  return null;
}

export async function getManagerStripeAccountForProperty(
  propertyId: string,
  rentAmountCents = 0
): Promise<{ accountId: string; feeCents: number; managerProfileId: string } | null> {
  const admin = createAdminClient();
  const feeInfo = await getManagerFeeForProperty(propertyId, rentAmountCents);
  if (feeInfo.feeCents <= 0) {
    return null;
  }

  let managerProfileId = feeInfo.managerProfileId;
  if (!managerProfileId) {
    const { data: assignments } = await admin
      .from("property_managers")
      .select("manager_profile_id")
      .eq("property_id", propertyId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    managerProfileId = assignments?.[0]?.manager_profile_id ?? null;
  }

  if (!managerProfileId) {
    return null;
  }

  const [profile] = await getConnectedStripeProfile([managerProfileId]);
  if (!profile?.stripe_account_id || !profile.stripe_onboarding_complete) {
    return null;
  }

  return {
    accountId: profile.stripe_account_id,
    feeCents: feeInfo.feeCents,
    managerProfileId
  };
}

export async function arePropertyOwnersConnected(propertyIds: string[]): Promise<Map<string, boolean>> {
  const uniquePropertyIds = Array.from(new Set(propertyIds.filter(Boolean)));
  const results = await Promise.all(
    uniquePropertyIds.map(async (propertyId) => [propertyId, Boolean(await getOwnerStripeAccountForProperty(propertyId))] as const)
  );

  return new Map(results);
}
