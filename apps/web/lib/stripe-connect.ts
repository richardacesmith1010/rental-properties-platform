import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerFeeForProperty } from "@/lib/payment-fees";
import { getStripeSecretKey } from "@/lib/stripe";

interface StripeAccountResponse {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
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
  const body = new URLSearchParams();
  body.set("type", "express");
  body.set("email", email);
  body.set("country", "US");
  body.set("capabilities[card_payments][requested]", "true");
  body.set("capabilities[transfers][requested]", "true");
  body.set("business_profile[mcc]", "6513");
  body.set("business_profile[url]", "https://domusbase.com");

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
    return [] as Array<{
      id: string;
      stripe_account_id: string | null;
      stripe_onboarding_complete: boolean | null;
    }>;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .in("id", profileIds);

  return data ?? [];
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
): Promise<{ accountId: string; feeCents: number } | null> {
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
    feeCents: feeInfo.feeCents
  };
}

export async function arePropertyOwnersConnected(propertyIds: string[]): Promise<Map<string, boolean>> {
  const uniquePropertyIds = Array.from(new Set(propertyIds.filter(Boolean)));
  const results = await Promise.all(
    uniquePropertyIds.map(async (propertyId) => [propertyId, Boolean(await getOwnerStripeAccountForProperty(propertyId))] as const)
  );

  return new Map(results);
}
