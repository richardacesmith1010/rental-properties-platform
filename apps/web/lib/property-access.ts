import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdministeredProperty {
  id: string;
  ownerAccountId: string;
}

interface LegacyPropertyRow {
  id: string;
  owner_profile_id: string;
  active?: boolean;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

async function getLegacyAdministeredProperties(
  userId: string,
  adminClient?: PropertyAccessClient
): Promise<AdministeredProperty[]> {
  const admin = adminClient ?? createAdminClient();

  const [{ data: ownedRows, error: ownedError }, { data: managerAssignments }] = await Promise.all([
    admin
      .from("properties")
      .select("id, owner_profile_id, active")
      .eq("owner_profile_id", userId),
    admin
      .from("property_managers")
      .select("property_id")
      .eq("manager_profile_id", userId)
      .eq("active", true)
  ]);

  const ownedRowsSafe: LegacyPropertyRow[] =
    ownedError && isMissingSchemaError(ownedError)
      ? (
          await admin
            .from("properties")
            .select("id, owner_profile_id")
            .eq("owner_profile_id", userId)
        ).data ?? []
      : ((ownedRows ?? []) as LegacyPropertyRow[]);

  const managerPropertyIds = unique((managerAssignments ?? []).map((row) => row.property_id));
  const { data: managerPropertyRows, error: managerPropertiesError } = managerPropertyIds.length
    ? await admin
        .from("properties")
        .select("id, owner_profile_id, active")
        .in("id", managerPropertyIds)
    : { data: [] as LegacyPropertyRow[], error: null };

  const managerRowsSafe: LegacyPropertyRow[] =
    managerPropertiesError && isMissingSchemaError(managerPropertiesError)
      ? (
          await admin
            .from("properties")
            .select("id, owner_profile_id")
            .in("id", managerPropertyIds)
        ).data ?? []
      : ((managerPropertyRows ?? []) as LegacyPropertyRow[]);

  const merged = [...ownedRowsSafe, ...managerRowsSafe].filter((property) => property.active !== false);
  const byPropertyId = new Map<string, AdministeredProperty>();

  for (const property of merged) {
    byPropertyId.set(property.id, {
      id: property.id,
      ownerAccountId: `legacy:${property.owner_profile_id}`
    });
  }

  return Array.from(byPropertyId.values());
}

type PropertyAccessClient = Pick<SupabaseClient, "from">;

export async function getAdministeredProperties(
  userId: string,
  adminClient?: PropertyAccessClient
): Promise<AdministeredProperty[]> {
  const admin = adminClient ?? createAdminClient();

  const [{ data: memberAccounts, error: memberError }, { data: managerAssignments }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("profile_id", userId)
      .eq("member_role", "owner")
      .eq("active", true),
    admin
      .from("property_managers")
      .select("property_id")
      .eq("manager_profile_id", userId)
      .eq("active", true)
  ]);

  if (memberError && isMissingSchemaError(memberError)) {
    return getLegacyAdministeredProperties(userId, admin);
  }

  const ownerAccountIds = unique((memberAccounts ?? []).map((row) => row.account_id));

  const ownerQuery = ownerAccountIds.length
    ? await admin
        .from("properties")
        .select("id, owner_account_id, active")
        .in("owner_account_id", ownerAccountIds)
    : { data: [] as Array<{ id: string; owner_account_id: string; active?: boolean }>, error: null };

  let ownerProperties: Array<{ id: string; owner_account_id: string; active?: boolean }> = [];
  if (ownerQuery.error && isMissingSchemaError(ownerQuery.error)) {
    const fallbackOwnerQuery = ownerAccountIds.length
      ? await admin
          .from("properties")
          .select("id, owner_account_id")
          .in("owner_account_id", ownerAccountIds)
      : { data: [] as Array<{ id: string; owner_account_id: string }>, error: null };

    if (fallbackOwnerQuery.error && isMissingSchemaError(fallbackOwnerQuery.error)) {
      return getLegacyAdministeredProperties(userId, admin);
    }

    ownerProperties = (fallbackOwnerQuery.data ?? []).map((property) => ({
      ...property,
      active: true
    }));
  } else {
    ownerProperties = ownerQuery.data ?? [];
  }

  ownerProperties = ownerProperties.filter((property) => property.active !== false);
  const managerPropertyIds = unique((managerAssignments ?? []).map((row) => row.property_id));
  const managerOnlyPropertyIds = managerPropertyIds.filter(
    (id) => !ownerProperties.some((property) => property.id === id)
  );

  const managerQuery = managerOnlyPropertyIds.length
    ? await admin
        .from("properties")
        .select("id, owner_account_id, active")
        .in("id", managerOnlyPropertyIds)
    : { data: [] as Array<{ id: string; owner_account_id: string; active?: boolean }>, error: null };

  let managerProperties: Array<{ id: string; owner_account_id: string; active?: boolean }> = [];
  if (managerQuery.error && isMissingSchemaError(managerQuery.error)) {
    const fallbackManagerQuery = managerOnlyPropertyIds.length
      ? await admin
          .from("properties")
          .select("id, owner_account_id")
          .in("id", managerOnlyPropertyIds)
      : { data: [] as Array<{ id: string; owner_account_id: string }>, error: null };

    if (fallbackManagerQuery.error && isMissingSchemaError(fallbackManagerQuery.error)) {
      return getLegacyAdministeredProperties(userId, admin);
    }

    managerProperties = (fallbackManagerQuery.data ?? []).map((property) => ({
      ...property,
      active: true
    }));
  } else {
    managerProperties = managerQuery.data ?? [];
  }

  const merged = [...ownerProperties, ...managerProperties].filter((property) => property.active !== false);
  const byPropertyId = new Map<string, AdministeredProperty>();

  for (const property of merged) {
    byPropertyId.set(property.id, {
      id: property.id,
      ownerAccountId: property.owner_account_id
    });
  }

  return Array.from(byPropertyId.values());
}

export async function getAdministeredPropertyIds(
  userId: string,
  adminClient?: PropertyAccessClient
): Promise<string[]> {
  const properties = await getAdministeredProperties(userId, adminClient);
  return properties.map((property) => property.id);
}

export async function getAdministeredPropertyIdsForAccount(
  userId: string,
  accountId: string,
  adminClient?: PropertyAccessClient
): Promise<string[]> {
  const admin = adminClient ?? createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("ownership_account_members")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("profile_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (membershipError && isMissingSchemaError(membershipError)) {
    return [];
  }

  if (membershipError || !membership) {
    return [];
  }

  const properties = await getAdministeredProperties(userId, admin);
  return properties
    .filter((property) => property.ownerAccountId === accountId)
    .map((property) => property.id);
}

export async function getAdministeredOwnerAccountIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [properties, membershipQuery] = await Promise.all([
    getAdministeredProperties(userId),
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("profile_id", userId)
      .eq("member_role", "owner")
      .eq("active", true)
  ]);

  if (membershipQuery.error && isMissingSchemaError(membershipQuery.error)) {
    return [];
  }

  return unique([
    ...properties
      .map((property) => property.ownerAccountId)
      .filter((ownerAccountId) => !ownerAccountId.startsWith("legacy:")),
    ...(membershipQuery.data ?? []).map((membership) => membership.account_id)
  ]);
}

export async function canUserAdministerProperty(userId: string, propertyId: string): Promise<boolean> {
  const propertyIds = await getAdministeredPropertyIds(userId);
  return propertyIds.includes(propertyId);
}
