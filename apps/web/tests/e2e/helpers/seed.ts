import { getAdminClient } from "./auth";
import { randomUUID } from "node:crypto";

function labelSuffix(id: string) {
  return id.slice(0, 8);
}

export async function seedOwnerData(userId: string) {
  const admin = getAdminClient();
  const suffix = labelSuffix(userId);
  const accountName = `E2E Owner Account ${suffix}`;
  const propertyName = `E2E Test Property ${suffix}`;

  const { data: existingAccount, error: accountLookupError } = await admin
    .from("ownership_accounts")
    .select("id")
    .eq("created_by_profile_id", userId)
    .eq("account_type", "individual")
    .limit(1)
    .maybeSingle();

  if (accountLookupError) {
    throw new Error(`Failed to look up ownership account: ${accountLookupError.message}`);
  }

  let accountId = existingAccount?.id ?? null;

  if (!accountId) {
    const { data: createdAccount, error: createAccountError } = await admin
      .from("ownership_accounts")
      .insert({
        account_type: "individual",
        display_name: accountName,
        created_by_profile_id: userId
      })
      .select("id")
      .single();

    if (createAccountError || !createdAccount?.id) {
      throw new Error(`Failed to create ownership account: ${createAccountError?.message ?? "missing id"}`);
    }

    accountId = createdAccount.id;
  }

  const { error: memberError } = await admin.from("ownership_account_members").upsert(
    {
      account_id: accountId,
      profile_id: userId,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (memberError) {
    throw new Error(`Failed to create ownership membership: ${memberError.message}`);
  }

  const { data: existingProperty, error: propertyLookupError } = await admin
    .from("properties")
    .select("id")
    .eq("owner_account_id", accountId)
    .eq("name", propertyName)
    .limit(1)
    .maybeSingle();

  if (propertyLookupError) {
    throw new Error(`Failed to look up property: ${propertyLookupError.message}`);
  }

  let propertyId = existingProperty?.id ?? null;

  if (!propertyId) {
    const { data: createdProperty, error: propertyError } = await admin
      .from("properties")
      .insert({
        owner_profile_id: userId,
        owner_account_id: accountId,
        name: propertyName,
        address_line1: `123 ${suffix} Test Street`,
        city: "Denver",
        state: "CO",
        postal_code: "80205",
        active: true
      })
      .select("id")
      .single();

    if (propertyError || !createdProperty?.id) {
      throw new Error(`Failed to create property: ${propertyError?.message ?? "missing id"}`);
    }

    propertyId = createdProperty.id;
  }

  const { data: existingUnit, error: unitLookupError } = await admin
    .from("units")
    .select("id")
    .eq("property_id", propertyId)
    .eq("unit_number", "101")
    .limit(1)
    .maybeSingle();

  if (unitLookupError) {
    throw new Error(`Failed to look up unit: ${unitLookupError.message}`);
  }

  let unitId = existingUnit?.id ?? null;

  if (!unitId) {
    const { data: createdUnit, error: unitError } = await admin
      .from("units")
      .insert({
        property_id: propertyId,
        unit_number: "101",
        bedrooms: 2,
        bathrooms: 1,
        monthly_rent_cents: 150000,
        occupied: false,
        active: true
      })
      .select("id")
      .single();

    if (unitError || !createdUnit?.id) {
      throw new Error(`Failed to create unit: ${unitError?.message ?? "missing id"}`);
    }

    unitId = createdUnit.id;
  }

  return { accountId, propertyId, unitId };
}

export async function seedOwnershipAccount(options: {
  userId: string;
  accountType: "individual" | "llc";
  displayName: string;
}) {
  const admin = getAdminClient();

  const { data: createdAccount, error: createAccountError } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: options.accountType,
      display_name: options.displayName,
      created_by_profile_id: options.userId,
      join_code: options.accountType === "llc" ? randomUUID().slice(0, 6).toUpperCase() : null
    })
    .select("id")
    .single();

  if (createAccountError || !createdAccount?.id) {
    throw new Error(`Failed to create ownership account: ${createAccountError?.message ?? "missing id"}`);
  }

  const { error: memberError } = await admin.from("ownership_account_members").upsert(
    {
      account_id: createdAccount.id,
      profile_id: options.userId,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (memberError) {
    throw new Error(`Failed to create ownership membership: ${memberError.message}`);
  }

  return { accountId: createdAccount.id };
}

export async function seedTenantLease(options: {
  tenantUserId: string;
  unitId: string;
  propertyId: string;
}) {
  const admin = getAdminClient();
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  const { data: existingLease, error: leaseLookupError } = await admin
    .from("leases")
    .select("id")
    .eq("unit_id", options.unitId)
    .eq("tenant_profile_id", options.tenantUserId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (leaseLookupError) {
    throw new Error(`Failed to look up lease: ${leaseLookupError.message}`);
  }

  let leaseId = existingLease?.id ?? null;

  if (!leaseId) {
    const { data: createdLease, error: leaseError } = await admin
      .from("leases")
      .insert({
        unit_id: options.unitId,
        tenant_profile_id: options.tenantUserId,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        monthly_rent_cents: 150000,
        deposit_cents: 150000,
        due_day_of_month: 1,
        grace_period_days: 5,
        late_fee_cents: 5000,
        lease_status: "active",
        active: true
      })
      .select("id")
      .single();

    if (leaseError || !createdLease?.id) {
      throw new Error(`Failed to create lease: ${leaseError?.message ?? "missing id"}`);
    }

    leaseId = createdLease.id;
  }

  const { error: occupancyError } = await admin
    .from("units")
    .update({ occupied: true })
    .eq("id", options.unitId);

  if (occupancyError) {
    throw new Error(`Failed to mark unit occupied: ${occupancyError.message}`);
  }

  const dueDate = new Date();
  dueDate.setUTCDate(1);
  if (dueDate < new Date()) {
    dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);
  }
  const dueDateIso = dueDate.toISOString().slice(0, 10);

  const { data: existingCharge, error: chargeLookupError } = await admin
    .from("rent_charges")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("due_date", dueDateIso)
    .eq("category", "rent")
    .limit(1)
    .maybeSingle();

  if (chargeLookupError) {
    throw new Error(`Failed to look up charge: ${chargeLookupError.message}`);
  }

  let chargeId = existingCharge?.id ?? null;

  if (!chargeId) {
    const { data: createdCharge, error: chargeError } = await admin
      .from("rent_charges")
      .insert({
        lease_id: leaseId,
        amount_cents: 150000,
        due_date: dueDateIso,
        status: "pending",
        category: "rent"
      })
      .select("id")
      .single();

    if (chargeError || !createdCharge?.id) {
      throw new Error(`Failed to create charge: ${chargeError?.message ?? "missing id"}`);
    }

    chargeId = createdCharge.id;
  }

  return {
    propertyId: options.propertyId,
    unitId: options.unitId,
    leaseId,
    chargeId
  };
}
