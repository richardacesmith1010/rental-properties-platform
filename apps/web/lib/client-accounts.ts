import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chunks, fetchAllPages } from "@/lib/supabase-pagination";

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

export async function getManagedHomeIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const rows = await fetchAllPages<{ property_id: string }>((from, to) => admin.from("property_managers")
    .select("property_id").eq("manager_profile_id", userId).eq("active", true).order("property_id").range(from, to));
  return [...new Set(rows.map((row) => row.property_id))];
}

export async function listClientAccountsForManager(userId: string): Promise<Array<{
  id: string; kind: "client" | "domusOwner"; name: string; accountType: "individual" | "llc";
  claimState: "claimed" | "unclaimed"; homeCount: number;
}>> {
  const admin = createAdminClient();
  const [{ data: links, error: linksError }, managedIds] = await Promise.all([
    admin.from("ownership_account_managers")
      .select("account_id").eq("manager_profile_id", userId).eq("active", true),
    getManagedHomeIds(userId)
  ]);
  if (linksError) throw linksError;
  const ids = [...new Set((links ?? []).map((link) => link.account_id))];
  const managedHomes = (await Promise.all(chunks(managedIds).map((part) => admin.from("properties")
    .select("id, owner_account_id, active").in("id", part)))).flatMap((result) => {
      if (result.error) throw result.error;
      return result.data ?? [];
    });
  const activeManagedHomes = managedHomes.filter((home) => home.active !== false);
  const ownerIds = [...new Set(activeManagedHomes.map((home) => home.owner_account_id))];
  const allIds = [...new Set([...ids, ...ownerIds])];
  if (!allIds.length) return [];
  const [accountResults, homeResults] = await Promise.all([
    Promise.all(chunks(allIds).map((part) => admin.from("ownership_accounts")
      .select("id, display_name, account_type, claim_state, managed_client").in("id", part))),
    Promise.all(chunks(ids).map((part) => admin.from("properties")
      .select("id, owner_account_id").in("owner_account_id", part)))
  ]);
  for (const result of [...accountResults, ...homeResults]) if (result.error) throw result.error;
  const accounts = accountResults.flatMap((result) => result.data ?? []);
  const homes = homeResults.flatMap((result) => result.data ?? []);
  const counts = new Map<string, number>();
  for (const home of homes ?? []) {
    counts.set(home.owner_account_id, (counts.get(home.owner_account_id) ?? 0) + 1);
  }
  return (accounts ?? []).filter((account) => account.managed_client ? ids.includes(account.id) : ownerIds.includes(account.id))
    .sort((a, b) => Number(b.managed_client) - Number(a.managed_client))
  .map((account) => ({
    id: account.id,
    kind: account.managed_client ? "client" as const : "domusOwner" as const,
    name: account.display_name,
    accountType: account.account_type,
    claimState: account.claim_state,
    homeCount: account.managed_client ? counts.get(account.id) ?? 0
      : activeManagedHomes.filter((home) => home.owner_account_id === account.id).length
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
