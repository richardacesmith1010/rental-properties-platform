import { deleteTestUser, getAdminClient, listTestUsers } from "./auth";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function cleanupTestUserData(userId: string, email?: string | null) {
  const admin = getAdminClient();

  try {
    const [{ data: membershipRows }, { data: createdAccounts }] = await Promise.all([
      admin.from("ownership_account_members").select("account_id").eq("profile_id", userId),
      admin.from("ownership_accounts").select("id").eq("created_by_profile_id", userId)
    ]);

    const accountIds = unique([
      ...(membershipRows ?? []).map((row) => row.account_id),
      ...(createdAccounts ?? []).map((row) => row.id)
    ]);

    const ownedProperties = new Map<string, true>();

    if (accountIds.length > 0) {
      const { data: accountProperties } = await admin
        .from("properties")
        .select("id")
        .in("owner_account_id", accountIds);

      for (const property of accountProperties ?? []) {
        ownedProperties.set(property.id, true);
      }
    }

    const { data: profileProperties } = await admin
      .from("properties")
      .select("id")
      .eq("owner_profile_id", userId);

    for (const property of profileProperties ?? []) {
      ownedProperties.set(property.id, true);
    }

    const propertyIds = Array.from(ownedProperties.keys());

    const { data: unitRows } = propertyIds.length
      ? await admin.from("units").select("id").in("property_id", propertyIds)
      : { data: [] as Array<{ id: string }> };

    const unitIds = (unitRows ?? []).map((unit) => unit.id);

    const [{ data: tenantLeases }, { data: unitLeases }] = await Promise.all([
      admin.from("leases").select("id").eq("tenant_profile_id", userId),
      unitIds.length
        ? admin.from("leases").select("id").in("unit_id", unitIds)
        : Promise.resolve({ data: [] as Array<{ id: string }>, error: null })
    ]);

    const leaseIds = unique([
      ...(tenantLeases ?? []).map((lease) => lease.id),
      ...(unitLeases ?? []).map((lease) => lease.id)
    ]);

    if (propertyIds.length > 0) {
      await admin.from("maintenance_tickets").delete().in("property_id", propertyIds);
      await admin.from("property_managers").delete().in("property_id", propertyIds);
      await admin.from("invitations").delete().in("property_id", propertyIds);
    }

    await admin.from("maintenance_tickets").delete().eq("tenant_profile_id", userId);
    await admin.from("property_managers").delete().eq("manager_profile_id", userId);
    await admin.from("invitations").delete().eq("invited_profile_id", userId);

    if (email) {
      await admin.from("invitations").delete().eq("email", email.toLowerCase());
    }

    if (leaseIds.length > 0) {
      await admin.from("leases").delete().in("id", leaseIds);
    }

    if (unitIds.length > 0) {
      await admin.from("units").delete().in("id", unitIds);
    }

    if (propertyIds.length > 0) {
      await admin.from("properties").delete().in("id", propertyIds);
    }

    if (accountIds.length > 0) {
      await admin.from("ownership_account_members").delete().in("account_id", accountIds);
      await admin.from("ownership_accounts").delete().in("id", accountIds);
    }

    await admin.from("feedback").delete().eq("profile_id", userId);
    if (email) {
      await admin.from("feedback").delete().eq("email", email.toLowerCase());
    }

    await admin.from("ownership_account_members").delete().eq("profile_id", userId);
    await admin.from("notifications").delete().eq("recipient_profile_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
  } catch (error) {
    console.warn("Best-effort E2E cleanup failed", error);
  }
}

export async function cleanupTestUser(userId: string, email?: string | null) {
  await cleanupTestUserData(userId, email);
  await deleteTestUser(userId).catch((error) => {
    console.warn(`Failed to delete test auth user ${userId}`, error);
  });
}

export async function cleanupAllTestData() {
  const users = await listTestUsers();
  for (const user of users) {
    await cleanupTestUser(user.id, user.email);
  }
}
