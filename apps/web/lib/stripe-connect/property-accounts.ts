import { createAdminClient } from "@/lib/supabase/admin";
import { assertStripeEligibleProperty } from "@/lib/client-accounts";
import { getManagerFeeForProperty } from "@/lib/payment-fees";
import { refreshStaleStripeAccounts, type StoredStripeAccount } from "./api";

export async function getConnectedStripeProfile(profileIds: string[]) {
  if (profileIds.length === 0) {
    return [] as Array<{ id: string; stripe_account_id: string | null; stripe_onboarding_complete: boolean | null }>;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .in("id", profileIds);
  if (error) {
    console.error("[stripe-connect] Failed to load connected profiles:", error);
    return [];
  }

  return data ?? [];
}

export async function getOwnerStripeAccountForProperty(propertyId: string): Promise<string | null> {
  await assertStripeEligibleProperty(propertyId);
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
  await assertStripeEligibleProperty(propertyId);
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
  if (uniquePropertyIds.length === 0) {
    return new Map();
  }

  const admin = createAdminClient();
  const { data: properties, error: propertyError } = await admin
    .from("properties")
    .select("id, owner_account_id, owner_profile_id")
    .in("id", uniquePropertyIds);
  if (propertyError) {
    console.error("[stripe-connect] Failed to load property owners:", propertyError);
    return new Map(uniquePropertyIds.map((propertyId) => [propertyId, false]));
  }
  const propertyRows = properties ?? [];
  const accountIds = Array.from(
    new Set(
      propertyRows
        .map((property) => property.owner_account_id)
        .filter((accountId): accountId is string => Boolean(accountId))
    )
  );

  const [accountStripeResult, accountCreatorResult, memberResult] = accountIds.length > 0
    ? await Promise.all([
        admin
          .from("ownership_accounts")
          .select("id, stripe_account_id, stripe_onboarding_complete, stripe_status, stripe_last_verified_at")
          .in("id", accountIds),
        admin
          .from("ownership_accounts")
          .select("id, created_by_profile_id")
          .in("id", accountIds),
        admin
          .from("ownership_account_members")
          .select("account_id, profile_id")
          .in("account_id", accountIds)
          .eq("member_role", "owner")
          .eq("active", true)
      ])
    : [
        { data: [] as StoredStripeAccount[], error: null },
        { data: [] as Array<{ id: string; created_by_profile_id: string | null }>, error: null },
        { data: [] as Array<{ account_id: string; profile_id: string }>, error: null }
      ];

  if (accountStripeResult.error) {
    console.error("[stripe-connect] Failed to load stored Stripe status:", accountStripeResult.error);
  }
  if (accountCreatorResult.error) {
    console.error("[stripe-connect] Failed to load account creators:", accountCreatorResult.error);
  }
  if (memberResult.error) {
    console.error("[stripe-connect] Failed to load account members:", memberResult.error);
  }
  const refreshedAccounts = accountStripeResult.error
    ? []
    : await refreshStaleStripeAccounts((accountStripeResult.data ?? []) as StoredStripeAccount[]);
  const accountStripeById = accountStripeResult.error
    ? new Map<string, { stripe_account_id: string | null; stripe_onboarding_complete: boolean | null }>()
    : new Map(refreshedAccounts.map((account) => [account.id, account]));
  const accountCreatorById = new Map(
    (accountCreatorResult.data ?? []).map((account) => [account.id, account.created_by_profile_id])
  );
  const memberProfileIdsByAccountId = new Map<string, string[]>();
  for (const member of memberResult.data ?? []) {
    memberProfileIdsByAccountId.set(member.account_id, [
      ...(memberProfileIdsByAccountId.get(member.account_id) ?? []),
      member.profile_id
    ]);
  }

  const orderedProfileIdsByAccountId = new Map<string, string[]>();
  for (const accountId of accountIds) {
    orderedProfileIdsByAccountId.set(
      accountId,
      Array.from(
        new Set(
          [
            accountCreatorById.get(accountId) ?? null,
            ...(memberProfileIdsByAccountId.get(accountId) ?? [])
          ].filter((profileId): profileId is string => Boolean(profileId))
        )
      )
    );
  }

  const profileIds = Array.from(
    new Set([
      ...Array.from(orderedProfileIdsByAccountId.values()).flat(),
      ...propertyRows
        .map((property) => property.owner_profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    ])
  );
  const profiles = await getConnectedStripeProfile(profileIds);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const propertyById = new Map(propertyRows.map((property) => [property.id, property]));

  const results = uniquePropertyIds.map((propertyId) => {
    const property = propertyById.get(propertyId);
    if (!property) {
      return [propertyId, false] as const;
    }

    if (!property.owner_account_id) {
      const profile = property.owner_profile_id
        ? profileById.get(property.owner_profile_id)
        : undefined;
      return [
        propertyId,
        Boolean(profile?.stripe_account_id && profile.stripe_onboarding_complete)
      ] as const;
    }

    const accountStripe = accountStripeById.get(property.owner_account_id);
    if (accountStripe?.stripe_account_id && accountStripe.stripe_onboarding_complete) {
      return [propertyId, true] as const;
    }

    const orderedProfileIds = orderedProfileIdsByAccountId.get(property.owner_account_id) ?? [];
    for (const profileId of orderedProfileIds) {
      const profile = profileById.get(profileId);
      if (profile?.stripe_account_id && profile.stripe_onboarding_complete) {
        return [propertyId, true] as const;
      }
    }

    if (property.owner_profile_id && !orderedProfileIds.includes(property.owner_profile_id)) {
      const profile = profileById.get(property.owner_profile_id);
      if (profile?.stripe_account_id && profile.stripe_onboarding_complete) {
        return [propertyId, true] as const;
      }
    }

    return [propertyId, false] as const;
  });

  return new Map(results);
}
