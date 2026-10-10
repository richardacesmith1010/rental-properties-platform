import type { SupabaseClient } from "@supabase/supabase-js";

export interface PropertyTeam {
  accountId: string | null;
  clientHome: boolean;
  ownerIds: string[];
  managerIds: string[];
}

function queryError(operation: string, error: { code?: string } | null) {
  if (error) console.error(`[notifications] ${operation}: ${error.code ?? "unknown"}`);
  return Boolean(error);
}

export async function listActiveManagersForProperty(
  admin: SupabaseClient,
  propertyId: string,
  scope?: { accountId: string | null; clientHome: boolean }
): Promise<string[]> {
  let accountScope = scope;
  if (!accountScope) {
    const { data: property, error: propertyError } = await admin.from("properties")
      .select("owner_account_id").eq("id", propertyId).maybeSingle();
    if (queryError("manager_property", propertyError) || !property) return [];
    const accountId: string | null = property.owner_account_id;
    const { data: account, error: accountError } = accountId
      ? await admin.from("ownership_accounts").select("managed_client").eq("id", accountId).maybeSingle()
      : { data: null, error: null };
    if (queryError("manager_account", accountError)) return [];
    accountScope = { accountId, clientHome: account?.managed_client === true };
  }
  const { accountId, clientHome } = accountScope;
  const { data: assignments, error } = await admin.from("property_managers")
    .select("manager_profile_id").eq("property_id", propertyId).eq("active", true);
  if (queryError("property_managers", error)) return [];
  const assigned = Array.from(new Set((assignments ?? []).map((row) => row.manager_profile_id)));
  if (!clientHome) return assigned;
  if (!accountId || assigned.length === 0) return [];
  const { data: links, error: linkError } = await admin.from("ownership_account_managers")
    .select("manager_profile_id").eq("account_id", accountId).eq("active", true)
    .in("manager_profile_id", assigned);
  if (queryError("ownership_account_managers", linkError)) return [];
  const linked = new Set((links ?? []).map((row) => row.manager_profile_id));
  return assigned.filter((id) => linked.has(id));
}

export async function loadPropertyTeam(admin: SupabaseClient, propertyId: string): Promise<PropertyTeam | null> {
  const { data: property, error: propertyError } = await admin.from("properties")
    .select("owner_account_id").eq("id", propertyId).maybeSingle();
  if (queryError("property", propertyError) || !property) return null;
  const accountId: string | null = property.owner_account_id;
  const { data: account, error: accountError } = accountId
    ? await admin.from("ownership_accounts").select("managed_client").eq("id", accountId).maybeSingle()
    : { data: null, error: null };
  if (queryError("account", accountError)) return null;
  const clientHome = account?.managed_client === true;
  const { data: members, error: membersError } = accountId
    ? await admin.from("ownership_account_members")
      .select("profile_id, can_receive_critical_alerts").eq("account_id", accountId)
      .eq("member_role", "owner").eq("active", true)
    : { data: [], error: null };
  if (queryError("owner_members", membersError)) return null;
  const managerIds = await listActiveManagersForProperty(admin, propertyId, { accountId, clientHome });
  return {
    accountId,
    clientHome,
    ownerIds: (members ?? []).filter((row) => row.can_receive_critical_alerts).map((row) => row.profile_id),
    managerIds
  };
}
