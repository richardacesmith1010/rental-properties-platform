import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ClientState = {
  managedClient: boolean;
  claimState: "claimed" | "unclaimed";
};

export const STRIPE_CLIENT_MESSAGE = "Online payments aren't available for this home yet.";

export class StripeNotEligibleError extends Error {
  constructor() {
    super(STRIPE_CLIENT_MESSAGE);
    this.name = "StripeNotEligibleError";
  }
}

export async function getClientState(accountId: string): Promise<ClientState | null> {
  const { data, error } = await createAdminClient().from("ownership_accounts")
    .select("managed_client, claim_state").eq("id", accountId).maybeSingle();
  if (error) throw error;
  return data ? { managedClient: data.managed_client, claimState: data.claim_state } : null;
}

export async function getClientStateForProperty(propertyId: string): Promise<ClientState | null> {
  const { data, error } = await createAdminClient().from("properties")
    .select("owner_account_id").eq("id", propertyId).maybeSingle();
  if (error) throw error;
  return data?.owner_account_id ? getClientState(data.owner_account_id) : null;
}

export async function getPropertyIdForLease(leaseId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: lease, error: leaseError } = await admin.from("leases")
    .select("unit_id").eq("id", leaseId).maybeSingle();
  if (leaseError) throw leaseError;
  if (!lease) throw new Error("Lease not found.");
  const { data: unit, error: unitError } = await admin.from("units")
    .select("property_id").eq("id", lease.unit_id).maybeSingle();
  if (unitError) throw unitError;
  if (!unit) throw new Error("Unit not found.");
  return unit.property_id;
}

export async function isUnclaimedClientAccount(accountId: string): Promise<boolean> {
  const state = await getClientState(accountId);
  return state?.managedClient === true && state.claimState === "unclaimed";
}

export async function isUnclaimedClientProperty(propertyId: string): Promise<boolean> {
  const state = await getClientStateForProperty(propertyId);
  return state?.managedClient === true && state.claimState === "unclaimed";
}

export async function isActiveClientManager(userId: string, accountId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("ownership_account_managers")
    .select("account_id").eq("manager_profile_id", userId).eq("account_id", accountId)
    .eq("active", true).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listClientAccountsForManager(userId: string): Promise<Array<{
  id: string; name: string; accountType: "individual" | "llc";
  claimState: "claimed" | "unclaimed"; homeCount: number;
}>> {
  const admin = createAdminClient();
  const { data: links, error: linksError } = await admin.from("ownership_account_managers")
    .select("account_id").eq("manager_profile_id", userId).eq("active", true);
  if (linksError) throw linksError;
  const ids = [...new Set((links ?? []).map((link) => link.account_id))];
  if (!ids.length) return [];
  const [{ data: accounts, error: accountError }, { data: homes, error: homeError }] = await Promise.all([
    admin.from("ownership_accounts").select("id, display_name, account_type, claim_state, managed_client").in("id", ids),
    admin.from("properties").select("id, owner_account_id").in("owner_account_id", ids)
  ]);
  if (accountError) throw accountError;
  if (homeError) throw homeError;
  const counts = new Map<string, number>();
  for (const home of homes ?? []) {
    counts.set(home.owner_account_id, (counts.get(home.owner_account_id) ?? 0) + 1);
  }
  return (accounts ?? []).filter((account) => ids.includes(account.id) && account.managed_client).map((account) => ({
    id: account.id,
    name: account.display_name,
    accountType: account.account_type,
    claimState: account.claim_state,
    homeCount: counts.get(account.id) ?? 0
  }));
}

export async function assertStripeEligibleAccount(accountId: string): Promise<void> {
  try {
    const state = await getClientState(accountId);
    if (!state || (state.managedClient && state.claimState === "unclaimed")) {
      throw new StripeNotEligibleError();
    }
  } catch {
    throw new StripeNotEligibleError();
  }
}

export async function assertStripeEligibleProperty(propertyId: string): Promise<void> {
  try {
    const state = await getClientStateForProperty(propertyId);
    if (state?.managedClient && state.claimState === "unclaimed") {
      throw new StripeNotEligibleError();
    }
    if (!state) {
      const { data, error } = await createAdminClient().from("properties")
        .select("id, owner_account_id").eq("id", propertyId).maybeSingle();
      if (error || !data || data.owner_account_id) throw new StripeNotEligibleError();
    }
  } catch {
    throw new StripeNotEligibleError();
  }
}
