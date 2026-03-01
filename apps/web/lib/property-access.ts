import { createAdminClient } from "@/lib/supabase/admin";

export interface AdministeredProperty {
  id: string;
  ownerAccountId: string;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function getAdministeredProperties(userId: string): Promise<AdministeredProperty[]> {
  const admin = createAdminClient();

  const [{ data: memberAccounts }, { data: managerAssignments }] = await Promise.all([
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

  const ownerAccountIds = unique([
    ...(memberAccounts ?? []).map((row) => row.account_id)
  ]);

  const { data: ownerProperties } = ownerAccountIds.length
    ? await admin
        .from("properties")
        .select("id, owner_account_id")
        .in("owner_account_id", ownerAccountIds)
    : { data: [] as Array<{ id: string; owner_account_id: string }> };

  const managerPropertyIds = unique((managerAssignments ?? []).map((row) => row.property_id));

  const managerOnlyPropertyIds = managerPropertyIds.filter(
    (id) => !(ownerProperties ?? []).some((property) => property.id === id)
  );

  const { data: managerProperties } = managerOnlyPropertyIds.length
    ? await admin
        .from("properties")
        .select("id, owner_account_id")
        .in("id", managerOnlyPropertyIds)
    : { data: [] as Array<{ id: string; owner_account_id: string }> };

  const merged = [...(ownerProperties ?? []), ...(managerProperties ?? [])];
  const byPropertyId = new Map<string, AdministeredProperty>();

  for (const property of merged) {
    byPropertyId.set(property.id, {
      id: property.id,
      ownerAccountId: property.owner_account_id
    });
  }

  return Array.from(byPropertyId.values());
}

export async function getAdministeredPropertyIds(userId: string): Promise<string[]> {
  const properties = await getAdministeredProperties(userId);
  return properties.map((property) => property.id);
}

export async function getAdministeredOwnerAccountIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [properties, { data: memberships }] = await Promise.all([
    getAdministeredProperties(userId),
    admin
      .from("ownership_account_members")
      .select("account_id")
      .eq("profile_id", userId)
      .eq("member_role", "owner")
      .eq("active", true)
  ]);

  return unique([
    ...properties.map((property) => property.ownerAccountId),
    ...(memberships ?? []).map((membership) => membership.account_id)
  ]);
}

export async function canUserAdministerProperty(userId: string, propertyId: string): Promise<boolean> {
  const propertyIds = await getAdministeredPropertyIds(userId);
  return propertyIds.includes(propertyId);
}
