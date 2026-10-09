import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeaseCollectionPreference {
  collects_outside_domus?: boolean | null;
  collectsOutsideDomus?: boolean | null;
  clientHome?: boolean | null;
  client_home?: boolean | null;
}

export function tracksLateRent(preference: LeaseCollectionPreference | null | undefined): boolean {
  return !isCollectedOutsideDomus(preference) ||
    preference?.clientHome === true || preference?.client_home === true;
}

export async function getClientHomeFlags(
  supabase: SupabaseClient,
  propertyIds: string[]
): Promise<Map<string, boolean>> {
  if (propertyIds.length === 0) return new Map();
  const { data: properties, error: propertyError } = await supabase
    .from("properties").select("id, owner_account_id").in("id", [...new Set(propertyIds)]);
  if (propertyError) throw propertyError;
  const accountIds = [...new Set((properties ?? []).map((row) => row.owner_account_id)
    .filter((id): id is string => Boolean(id)))];
  if (accountIds.length === 0) return new Map();
  const { data: accounts, error: accountError } = await supabase
    .from("ownership_accounts").select("id, managed_client").in("id", accountIds);
  if (accountError) throw accountError;
  const clientAccounts = new Set((accounts ?? [])
    .filter((row) => row.managed_client === true).map((row) => row.id));
  return new Map((properties ?? []).map((row) =>
    [row.id, row.owner_account_id != null && clientAccounts.has(row.owner_account_id)]));
}

export function isCollectedOutsideDomus(
  lease: LeaseCollectionPreference | null | undefined
): boolean {
  return lease?.collects_outside_domus === true || lease?.collectsOutsideDomus === true;
}
