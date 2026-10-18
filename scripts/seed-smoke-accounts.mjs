import { deterministicUuid, hashPassword, createAdminClient, createSummary, record, printSummary, fail,
  listTargetUsers, ensureProfile, ensureOwnerMembership } from "./lib/seed-helpers.mjs";
import { pathToFileURL } from "node:url";

const SMOKE_MARKER = "domus-smoke-v1";
const LEASE_START_DATE = "2026-07-01";
const LEASE_END_DATE = "2031-06-30";
const SMOKE_RENT_CENTS = 100;
const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMOKE_OWNER_EMAIL",
  "SMOKE_OWNER_PASSWORD",
  "SMOKE_MANAGER_EMAIL",
  "SMOKE_MANAGER_PASSWORD",
  "SMOKE_TENANT_EMAIL",
  "SMOKE_TENANT_PASSWORD"
];

function loadConfig() {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    users: {
      owner: {
        email: process.env.SMOKE_OWNER_EMAIL.trim().toLowerCase(),
        password: process.env.SMOKE_OWNER_PASSWORD,
        role: "owner",
        fullName: "Smoke Owner"
      },
      manager: {
        email: process.env.SMOKE_MANAGER_EMAIL.trim().toLowerCase(),
        password: process.env.SMOKE_MANAGER_PASSWORD,
        role: "manager",
        fullName: "Smoke Manager"
      },
      tenant: {
        email: process.env.SMOKE_TENANT_EMAIL.trim().toLowerCase(),
        password: process.env.SMOKE_TENANT_PASSWORD,
        role: "tenant",
        fullName: "Smoke Tenant"
      }
    }
  };
}

async function ensureSmokeUser(admin, spec, existingUser, summary) {
  const passwordHash = hashPassword(spec.password);
  const expectedMetadata = {
    full_name: spec.fullName,
    role: spec.role,
    smoke_seed: SMOKE_MARKER,
    smoke_role: spec.role,
    smoke_password_hash: passwordHash
  };

  if (!existingUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: expectedMetadata
    });

    if (error || !data.user) {
      throw new Error(`Failed to create auth user ${spec.email}: ${error?.message ?? "missing user"}`);
    }

    record(summary, "created", `${spec.role} auth user`);
    return data.user;
  }

  const currentMetadata = existingUser.user_metadata ?? {};
  if (currentMetadata.smoke_seed !== SMOKE_MARKER) {
    throw new Error(`Refusing to modify existing non-smoke auth user ${spec.email}.`);
  }

  const needsAuthUpdate =
    currentMetadata.full_name !== spec.fullName ||
    currentMetadata.role !== spec.role ||
    currentMetadata.smoke_role !== spec.role ||
    currentMetadata.smoke_password_hash !== passwordHash;

  if (!needsAuthUpdate) {
    record(summary, "existing", `${spec.role} auth user`);
    return existingUser;
  }

  const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
    password: spec.password,
    email_confirm: true,
    user_metadata: {
      ...currentMetadata,
      ...expectedMetadata
    }
  });

  if (error || !data.user) {
    throw new Error(`Failed to update smoke auth user ${spec.email}: ${error?.message ?? "missing user"}`);
  }

  record(summary, "updated", `${spec.role} auth user`);
  return data.user;
}

async function ensureOwnershipAccount(admin, ownerProfileId, summary) {
  const desiredId = deterministicUuid("smoke-owner-account");

  const { data: existingAccountById, error: lookupByIdError } = await admin
    .from("ownership_accounts")
    .select("id, display_name, created_by_profile_id")
    .eq("id", desiredId)
    .maybeSingle();

  if (lookupByIdError) {
    throw new Error(`Failed to look up smoke ownership account: ${lookupByIdError.message}`);
  }

  if (!existingAccountById) {
    const { data: conflictingAccount, error: conflictLookupError } = await admin
      .from("ownership_accounts")
      .select("id, display_name, created_by_profile_id")
      .eq("created_by_profile_id", ownerProfileId)
      .eq("account_type", "individual")
      .neq("id", desiredId)
      .limit(1)
      .maybeSingle();

    if (conflictLookupError) {
      throw new Error(`Failed to query owner ownership account: ${conflictLookupError.message}`);
    }

    if (conflictingAccount) {
      throw new Error("Smoke owner already has a different individual ownership account.");
    }

    const { data, error } = await admin
      .from("ownership_accounts")
      .insert({
        id: desiredId,
        account_type: "individual",
        display_name: "Smoke Owner Account",
        created_by_profile_id: ownerProfileId
      })
      .select("id, display_name, created_by_profile_id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create smoke ownership account: ${error?.message ?? "missing account"}`);
    }

    record(summary, "created", "ownership account");
    return data;
  }

  const needsUpdate =
    existingAccountById.display_name !== "Smoke Owner Account" ||
    existingAccountById.created_by_profile_id !== ownerProfileId;

  if (!needsUpdate) {
    record(summary, "existing", "ownership account");
    return existingAccountById;
  }

  const { data, error } = await admin
    .from("ownership_accounts")
    .update({
      display_name: "Smoke Owner Account",
      created_by_profile_id: ownerProfileId
    })
    .eq("id", existingAccountById.id)
    .select("id, display_name, created_by_profile_id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to align ownership account: ${error?.message ?? "missing account"}`);
  }

  record(summary, "updated", "ownership account");
  return data;
}

async function ensureSmokeProperty(admin, ownerProfileId, ownerAccountId, summary) {
  const propertyId = deterministicUuid("smoke-property");
  const expected = {
    id: propertyId,
    owner_profile_id: ownerProfileId,
    owner_account_id: ownerAccountId,
    name: "Smoke Test Property",
    address_line1: "100 Smoke Test Ave",
    city: "Denver",
    state: "CO",
    postal_code: "80205",
    active: true
  };

  const { data: existingProperty, error: lookupError } = await admin
    .from("properties")
    .select("id, owner_profile_id, owner_account_id, name, address_line1, city, state, postal_code, active")
    .eq("id", propertyId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up smoke property: ${lookupError.message}`);
  }

  if (!existingProperty) {
    const { data: conflictingProperty, error: conflictLookupError } = await admin
      .from("properties")
      .select("id")
      .eq("owner_account_id", ownerAccountId)
      .eq("name", expected.name)
      .neq("id", propertyId)
      .limit(1)
      .maybeSingle();

    if (conflictLookupError) {
      throw new Error(`Failed to inspect conflicting smoke property rows: ${conflictLookupError.message}`);
    }

    if (conflictingProperty) {
      throw new Error("Smoke property name already exists on the owner account with a different id.");
    }

    const { error } = await admin.from("properties").insert(expected);
    if (error) {
      throw new Error(`Failed to create smoke property: ${error.message}`);
    }

    record(summary, "created", "smoke property");
    return propertyId;
  }

  const needsUpdate =
    existingProperty.owner_profile_id !== expected.owner_profile_id ||
    existingProperty.owner_account_id !== expected.owner_account_id ||
    existingProperty.name !== expected.name ||
    existingProperty.address_line1 !== expected.address_line1 ||
    existingProperty.city !== expected.city ||
    existingProperty.state !== expected.state ||
    existingProperty.postal_code !== expected.postal_code ||
    existingProperty.active !== expected.active;

  if (!needsUpdate) {
    record(summary, "existing", "smoke property");
    return propertyId;
  }

  const { error } = await admin
    .from("properties")
    .update({
      owner_profile_id: expected.owner_profile_id,
      owner_account_id: expected.owner_account_id,
      name: expected.name,
      address_line1: expected.address_line1,
      city: expected.city,
      state: expected.state,
      postal_code: expected.postal_code,
      active: expected.active
    })
    .eq("id", propertyId);
  if (error) {
    throw new Error(`Failed to align smoke property: ${error.message}`);
  }

  record(summary, "updated", "smoke property");
  return propertyId;
}

async function ensureSmokeUnit(admin, propertyId, summary) {
  const unitId = deterministicUuid("smoke-unit");
  const expected = {
    id: unitId,
    property_id: propertyId,
    unit_number: "Unit S",
    bedrooms: 1,
    bathrooms: 1,
    monthly_rent_cents: SMOKE_RENT_CENTS,
    occupied: true,
    active: true
  };

  const { data: existingUnit, error: lookupError } = await admin
    .from("units")
    .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, occupied, active")
    .eq("id", unitId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up smoke unit: ${lookupError.message}`);
  }

  if (!existingUnit) {
    const { data: conflictingUnit, error: conflictLookupError } = await admin
      .from("units")
      .select("id")
      .eq("property_id", propertyId)
      .eq("unit_number", expected.unit_number)
      .neq("id", unitId)
      .limit(1)
      .maybeSingle();

    if (conflictLookupError) {
      throw new Error(`Failed to inspect conflicting smoke unit rows: ${conflictLookupError.message}`);
    }

    if (conflictingUnit) {
      throw new Error("Smoke unit already exists on the property with a different id.");
    }

    const { error } = await admin.from("units").insert(expected);
    if (error) {
      throw new Error(`Failed to create smoke unit: ${error.message}`);
    }

    record(summary, "created", "smoke unit");
    return unitId;
  }

  const needsUpdate =
    existingUnit.property_id !== expected.property_id ||
    existingUnit.unit_number !== expected.unit_number ||
    existingUnit.bedrooms !== expected.bedrooms ||
    Number(existingUnit.bathrooms) !== expected.bathrooms ||
    existingUnit.monthly_rent_cents !== expected.monthly_rent_cents ||
    existingUnit.occupied !== expected.occupied ||
    existingUnit.active !== expected.active;

  if (!needsUpdate) {
    record(summary, "existing", "smoke unit");
    return unitId;
  }

  const { error } = await admin
    .from("units")
    .update({
      property_id: expected.property_id,
      unit_number: expected.unit_number,
      bedrooms: expected.bedrooms,
      bathrooms: expected.bathrooms,
      monthly_rent_cents: expected.monthly_rent_cents,
      occupied: expected.occupied,
      active: expected.active
    })
    .eq("id", unitId);

  if (error) {
    throw new Error(`Failed to align smoke unit: ${error.message}`);
  }

  record(summary, "updated", "smoke unit");
  return unitId;
}

async function ensureManagerAssignment(admin, propertyId, managerProfileId, summary) {
  const expected = {
    property_id: propertyId,
    manager_profile_id: managerProfileId,
    active: true
  };

  const { data: existingAssignment, error: lookupError } = await admin
    .from("property_managers")
    .select("property_id, manager_profile_id, active")
    .eq("property_id", propertyId)
    .eq("manager_profile_id", managerProfileId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up manager assignment: ${lookupError.message}`);
  }

  if (!existingAssignment) {
    const { error } = await admin.from("property_managers").insert(expected);
    if (error) {
      throw new Error(`Failed to create manager assignment: ${error.message}`);
    }

    record(summary, "created", "manager assignment");
    return;
  }

  if (existingAssignment.active === true) {
    record(summary, "existing", "manager assignment");
    return;
  }

  const { error } = await admin
    .from("property_managers")
    .update({ active: true })
    .eq("property_id", propertyId)
    .eq("manager_profile_id", managerProfileId);

  if (error) {
    throw new Error(`Failed to align manager assignment: ${error.message}`);
  }

  record(summary, "updated", "manager assignment");
}

async function ensureSmokeLease(admin, unitId, tenantProfileId, summary) {
  const leaseId = deterministicUuid("smoke-lease");
  const expected = {
    id: leaseId,
    unit_id: unitId,
    tenant_profile_id: tenantProfileId,
    start_date: LEASE_START_DATE,
    end_date: LEASE_END_DATE,
    monthly_rent_cents: SMOKE_RENT_CENTS,
    deposit_cents: 0,
    due_day_of_month: 1,
    grace_period_days: 5,
    late_fee_cents: 0,
    lease_status: "active",
    active: true
  };

  const { data: otherActiveLease, error: otherLeaseError } = await admin
    .from("leases")
    .select("id, tenant_profile_id")
    .eq("unit_id", unitId)
    .eq("active", true)
    .neq("id", leaseId)
    .limit(1)
    .maybeSingle();

  if (otherLeaseError) {
    throw new Error(`Failed to inspect existing active leases: ${otherLeaseError.message}`);
  }

  if (otherActiveLease && otherActiveLease.tenant_profile_id !== tenantProfileId) {
    throw new Error("Smoke unit already has an active lease for a different tenant.");
  }

  const { data: existingLease, error: lookupError } = await admin
    .from("leases")
    .select(
      "id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, grace_period_days, late_fee_cents, lease_status, active"
    )
    .eq("id", leaseId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up smoke lease: ${lookupError.message}`);
  }

  if (!existingLease) {
    const { data: conflictingLease, error: conflictLookupError } = await admin
      .from("leases")
      .select("id")
      .eq("unit_id", unitId)
      .eq("tenant_profile_id", tenantProfileId)
      .eq("active", true)
      .neq("id", leaseId)
      .limit(1)
      .maybeSingle();

    if (conflictLookupError) {
      throw new Error(`Failed to inspect conflicting smoke lease rows: ${conflictLookupError.message}`);
    }

    if (conflictingLease) {
      throw new Error("Smoke tenant already has a different active lease on the smoke unit.");
    }

    const { error } = await admin.from("leases").insert(expected);
    if (error) {
      throw new Error(`Failed to create smoke lease: ${error.message}`);
    }

    record(summary, "created", "smoke lease");
    return;
  }

  const needsUpdate =
    existingLease.unit_id !== expected.unit_id ||
    existingLease.tenant_profile_id !== expected.tenant_profile_id ||
    existingLease.start_date !== expected.start_date ||
    existingLease.end_date !== expected.end_date ||
    existingLease.monthly_rent_cents !== expected.monthly_rent_cents ||
    existingLease.deposit_cents !== expected.deposit_cents ||
    existingLease.due_day_of_month !== expected.due_day_of_month ||
    existingLease.grace_period_days !== expected.grace_period_days ||
    existingLease.late_fee_cents !== expected.late_fee_cents ||
    existingLease.lease_status !== expected.lease_status ||
    existingLease.active !== expected.active;

  if (!needsUpdate) {
    record(summary, "existing", "smoke lease");
    return;
  }

  const { error } = await admin
    .from("leases")
    .update({
      unit_id: expected.unit_id,
      tenant_profile_id: expected.tenant_profile_id,
      start_date: expected.start_date,
      end_date: expected.end_date,
      monthly_rent_cents: expected.monthly_rent_cents,
      deposit_cents: expected.deposit_cents,
      due_day_of_month: expected.due_day_of_month,
      grace_period_days: expected.grace_period_days,
      late_fee_cents: expected.late_fee_cents,
      lease_status: expected.lease_status,
      active: expected.active
    })
    .eq("id", leaseId);

  if (error) {
    throw new Error(`Failed to align smoke lease: ${error.message}`);
  }

  record(summary, "updated", "smoke lease");
}

export async function runSmokeSeed({ admin, config }) {
  const summary = createSummary();

  const authUsersByEmail = await listTargetUsers(admin, [
    config.users.owner.email,
    config.users.manager.email,
    config.users.tenant.email
  ]);

  const ownerUser = await ensureSmokeUser(
    admin,
    config.users.owner,
    authUsersByEmail.get(config.users.owner.email),
    summary
  );
  await ensureProfile(admin, ownerUser, config.users.owner, summary);

  const managerUser = await ensureSmokeUser(
    admin,
    config.users.manager,
    authUsersByEmail.get(config.users.manager.email),
    summary
  );
  await ensureProfile(admin, managerUser, config.users.manager, summary);

  const tenantUser = await ensureSmokeUser(
    admin,
    config.users.tenant,
    authUsersByEmail.get(config.users.tenant.email),
    summary
  );
  await ensureProfile(admin, tenantUser, config.users.tenant, summary);

  const ownershipAccount = await ensureOwnershipAccount(admin, ownerUser.id, summary);
  await ensureOwnerMembership(admin, ownershipAccount.id, ownerUser.id, summary);

  const propertyId = await ensureSmokeProperty(admin, ownerUser.id, ownershipAccount.id, summary);
  const unitId = await ensureSmokeUnit(admin, propertyId, summary);
  await ensureManagerAssignment(admin, propertyId, managerUser.id, summary);
  await ensureSmokeLease(admin, unitId, tenantUser.id, summary);

  printSummary(summary);
  console.log("[smoke-seed] complete");
}

async function main() {
  const config = loadConfig();
  const admin = createAdminClient(config);
  await runSmokeSeed({ admin, config });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => fail("seed smoke accounts", error));
}
