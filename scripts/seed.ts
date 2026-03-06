import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  leaseSeeds,
  propertySeeds,
  tenantSeeds,
  unitsPerProperty,
  vendorSeeds
} from "./seed-data";

function deterministicUuid(key: string) {
  const hex = createHash("sha1").update(`domus-seed:${key}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  const variant = parseInt(chars[16], 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthOffset(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

async function ensureOwnerContext(
  admin: ReturnType<typeof createClient>
): Promise<{ ownerProfileId: string; ownerAccountId: string }> {
  const { data: existingOwnerMember, error: ownerMemberError } = await admin
    .from("ownership_account_members")
    .select("account_id, profile_id")
    .eq("member_role", "owner")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (ownerMemberError) {
    throw new Error(`Failed to fetch ownership account members: ${ownerMemberError.message}`);
  }

  if (existingOwnerMember?.profile_id && existingOwnerMember.account_id) {
    return {
      ownerProfileId: existingOwnerMember.profile_id,
      ownerAccountId: existingOwnerMember.account_id
    };
  }

  const { data: ownerProfile, error: ownerProfileError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (ownerProfileError) {
    throw new Error(`Failed to fetch owner profile: ${ownerProfileError.message}`);
  }

  if (!ownerProfile?.id) {
    throw new Error("No owner profile found. Create an owner account before running seed.");
  }

  const ownerAccountId = deterministicUuid("seed-owner-account");
  const { error: accountError } = await admin.from("ownership_accounts").upsert(
    {
      id: ownerAccountId,
      account_type: "individual",
      display_name: "Seed Owner Account",
      created_by_profile_id: ownerProfile.id
    },
    { onConflict: "id" }
  );

  if (accountError) {
    throw new Error(`Failed to upsert seed owner account: ${accountError.message}`);
  }

  const { error: memberError } = await admin.from("ownership_account_members").upsert(
    {
      account_id: ownerAccountId,
      profile_id: ownerProfile.id,
      member_role: "owner",
      can_receive_critical_alerts: true,
      active: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (memberError) {
    throw new Error(`Failed to upsert seed owner membership: ${memberError.message}`);
  }

  return {
    ownerProfileId: ownerProfile.id,
    ownerAccountId
  };
}

async function ensureTenantProfiles(admin: ReturnType<typeof createClient>) {
  const tenantProfiles: Array<{ id: string; email: string; fullName: string }> = [];

  for (const tenant of tenantSeeds) {
    const normalizedEmail = tenant.email.toLowerCase();
    let profileId: string | null = null;

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (profileLookupError) {
      throw new Error(`Failed to query tenant profile for ${normalizedEmail}: ${profileLookupError.message}`);
    }

    if (existingProfile?.id) {
      profileId = existingProfile.id;
    } else {
      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
          role: "tenant",
          full_name: tenant.fullName
        }
      });

      if (createUserError && !createUserError.message.toLowerCase().includes("already been registered")) {
        throw new Error(`Failed to create auth user for ${normalizedEmail}: ${createUserError.message}`);
      }

      const { data: profileAfterCreate, error: profileAfterCreateError } = await admin
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profileAfterCreateError) {
        throw new Error(`Failed to read profile for ${normalizedEmail}: ${profileAfterCreateError.message}`);
      }

      profileId = profileAfterCreate?.id ?? createdUser.user?.id ?? null;

      if (!profileId) {
        throw new Error(`Unable to resolve profile ID for ${normalizedEmail} after user creation.`);
      }

      const { error: upsertProfileError } = await admin.from("profiles").upsert(
        {
          id: profileId,
          email: normalizedEmail,
          role: "tenant",
          full_name: tenant.fullName
        },
        { onConflict: "id" }
      );

      if (upsertProfileError) {
        throw new Error(`Failed to upsert profile for ${normalizedEmail}: ${upsertProfileError.message}`);
      }
    }

    tenantProfiles.push({
      id: profileId,
      email: normalizedEmail,
      fullName: tenant.fullName
    });
  }

  return tenantProfiles;
}

export async function seed() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { ownerProfileId, ownerAccountId } = await ensureOwnerContext(admin);
  const tenantProfiles = await ensureTenantProfiles(admin);

  const propertyRows = propertySeeds.map((property) => ({
    id: deterministicUuid(`property:${property.key}`),
    owner_account_id: ownerAccountId,
    owner_profile_id: ownerProfileId,
    name: property.name,
    address_line1: property.addressLine1,
    city: property.city,
    state: property.state,
    postal_code: property.postalCode,
    active: true
  }));

  const { error: propertyError } = await admin
    .from("properties")
    .upsert(propertyRows, { onConflict: "id" });

  if (propertyError) {
    throw new Error(`Failed to seed properties: ${propertyError.message}`);
  }

  const unitRows = propertyRows.flatMap((property) =>
    unitsPerProperty.map((unit) => ({
      id: deterministicUuid(`unit:${property.id}:${unit.key}`),
      property_id: property.id,
      unit_number: unit.label,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      monthly_rent_cents: unit.monthlyRentCents,
      occupied: false,
      active: true
    }))
  );

  const { error: unitError } = await admin.from("units").upsert(unitRows, { onConflict: "id" });
  if (unitError) {
    throw new Error(`Failed to seed units: ${unitError.message}`);
  }

  const selectedUnits = unitRows.slice(0, tenantProfiles.length);
  const leaseStart = monthOffset(new Date(), 0);
  const leaseEnd = new Date(leaseStart.getFullYear() + 1, leaseStart.getMonth(), leaseStart.getDate());

  const leaseRows = selectedUnits.map((unit, index) => ({
    id: deterministicUuid(`lease:${unit.id}:${tenantProfiles[index].id}`),
    unit_id: unit.id,
    tenant_profile_id: tenantProfiles[index].id,
    start_date: toIsoDate(leaseStart),
    end_date: toIsoDate(leaseEnd),
    due_day_of_month: leaseSeeds[index]?.dueDayOfMonth ?? 1,
    monthly_rent_cents: leaseSeeds[index]?.monthlyRentCents ?? 150000,
    deposit_cents: leaseSeeds[index]?.depositCents ?? 150000,
    grace_period_days: leaseSeeds[index]?.gracePeriodDays ?? 5,
    late_fee_cents: leaseSeeds[index]?.lateFeeCents ?? 0,
    lease_status: "active",
    active: true
  }));

  const { error: leaseError } = await admin.from("leases").upsert(leaseRows, { onConflict: "id" });
  if (leaseError) {
    throw new Error(`Failed to seed leases: ${leaseError.message}`);
  }

  const { error: occupiedUpdateError } = await admin
    .from("units")
    .update({ occupied: true })
    .in(
      "id",
      selectedUnits.map((unit) => unit.id)
    );
  if (occupiedUpdateError) {
    throw new Error(`Failed to update occupied units: ${occupiedUpdateError.message}`);
  }

  const dueDates = [monthOffset(new Date(), -1), monthOffset(new Date(), 0), monthOffset(new Date(), 1)];
  const chargeAmounts = [
    leaseSeeds[0]?.monthlyRentCents ?? 150000,
    leaseSeeds[1]?.monthlyRentCents ?? 180000,
    leaseSeeds[2]?.monthlyRentCents ?? 220000
  ];
  const chargeStatuses = ["paid", "pending", "pending"] as const;

  const chargeRows = leaseRows.flatMap((lease) =>
    dueDates.map((dueDate, index) => ({
      id: deterministicUuid(`charge:${lease.id}:${toIsoDate(dueDate)}`),
      lease_id: lease.id,
      due_date: toIsoDate(dueDate),
      amount_cents: chargeAmounts[index],
      status: chargeStatuses[index],
      category: "rent",
      parent_charge_id: null,
      created_at: new Date().toISOString()
    }))
  );

  const lateFeeChargeRows = [
    { leaseIndex: 0, dueDateIndex: 1 },
    { leaseIndex: 2, dueDateIndex: 1 }
  ]
    .map(({ leaseIndex, dueDateIndex }) => {
      const lease = leaseRows[leaseIndex];
      if (!lease || (lease.late_fee_cents ?? 0) <= 0) {
        return null;
      }
      const dueDateIso = toIsoDate(dueDates[dueDateIndex]);
      const parentChargeId = deterministicUuid(`charge:${lease.id}:${dueDateIso}`);

      return {
        id: deterministicUuid(`late-fee:${parentChargeId}`),
        lease_id: lease.id,
        due_date: dueDateIso,
        amount_cents: lease.late_fee_cents ?? 0,
        status: "pending",
        category: "late_fee",
        parent_charge_id: parentChargeId,
        created_at: new Date().toISOString()
      };
    })
    .filter(
      (charge): charge is {
        id: string;
        lease_id: string;
        due_date: string;
        amount_cents: number;
        status: "pending";
        category: "late_fee";
        parent_charge_id: string;
        created_at: string;
      } => charge !== null
    );

  const { error: chargeError } = await admin
    .from("rent_charges")
    .upsert([...chargeRows, ...lateFeeChargeRows], { onConflict: "id" });
  if (chargeError) {
    throw new Error(`Failed to seed rent charges: ${chargeError.message}`);
  }

  const maintenanceRows = [
    {
      id: deterministicUuid("ticket:open"),
      property_id: propertyRows[0].id,
      unit_id: selectedUnits[0].id,
      created_by_profile_id: tenantProfiles[0].id,
      title: "Kitchen faucet leak",
      description: "Water dripping steadily under the sink cabinet.",
      priority: "medium",
      status: "open"
    },
    {
      id: deterministicUuid("ticket:in-progress"),
      property_id: propertyRows[1].id,
      unit_id: selectedUnits[1].id,
      created_by_profile_id: tenantProfiles[1].id,
      title: "Hallway light flicker",
      description: "Main hallway light flickers every evening.",
      priority: "high",
      status: "in_progress"
    },
    {
      id: deterministicUuid("ticket:resolved"),
      property_id: propertyRows[2].id,
      unit_id: selectedUnits[2].id,
      created_by_profile_id: tenantProfiles[2].id,
      title: "HVAC filter replacement",
      description: "Filter replaced and airflow restored.",
      priority: "low",
      status: "resolved"
    },
    {
      id: deterministicUuid("ticket:open-2"),
      property_id: propertyRows[0].id,
      unit_id: unitRows[1].id,
      created_by_profile_id: tenantProfiles[0].id,
      title: "Patio door alignment",
      description: "Sliding door sticks when closing.",
      priority: "medium",
      status: "open"
    }
  ];

  const { error: maintenanceError } = await admin
    .from("maintenance_tickets")
    .upsert(maintenanceRows, { onConflict: "id" });
  if (maintenanceError) {
    throw new Error(`Failed to seed maintenance tickets: ${maintenanceError.message}`);
  }

  const listingRows = [
    {
      id: deterministicUuid("listing:published"),
      property_id: propertyRows[0].id,
      created_by_profile_id: ownerProfileId,
      status: "published",
      headline: "Renovated 2BR at Sunset Ridge",
      description: "Updated flooring, stainless appliances, and covered parking.",
      asking_rent_cents: 180000,
      available_on: toIsoDate(monthOffset(new Date(), 1)),
      bedroom_count: 2,
      bathroom_count: 1
    },
    {
      id: deterministicUuid("listing:draft"),
      property_id: propertyRows[1].id,
      created_by_profile_id: ownerProfileId,
      status: "draft",
      headline: "Townhome near Oak Park",
      description: "Three-bedroom townhome with fenced patio.",
      asking_rent_cents: 220000,
      available_on: toIsoDate(monthOffset(new Date(), 2)),
      bedroom_count: 3,
      bathroom_count: 2
    }
  ];

  const { error: listingError } = await admin
    .from("rental_listings")
    .upsert(listingRows, { onConflict: "id" });
  if (listingError) {
    throw new Error(`Failed to seed rental listings: ${listingError.message}`);
  }

  const applicationRows = [
    {
      id: deterministicUuid("application:submitted"),
      listing_id: listingRows[0].id,
      property_id: listingRows[0].property_id,
      applicant_email: tenantProfiles[0].email,
      applicant_name: tenantProfiles[0].fullName,
      applicant_phone: "555-410-1000",
      status: "submitted",
      submitted_at: new Date().toISOString(),
      source: "manual-seed",
      notes: "Initial seeded application"
    },
    {
      id: deterministicUuid("application:approved"),
      listing_id: listingRows[1].id,
      property_id: listingRows[1].property_id,
      applicant_email: tenantProfiles[1].email,
      applicant_name: tenantProfiles[1].fullName,
      applicant_phone: "555-410-2000",
      status: "approved",
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by_profile_id: ownerProfileId,
      source: "manual-seed",
      notes: "Approved for move-in"
    }
  ];

  const { error: applicationError } = await admin
    .from("rental_applications")
    .upsert(applicationRows, { onConflict: "id" });
  if (applicationError) {
    throw new Error(`Failed to seed rental applications: ${applicationError.message}`);
  }

  const vendorRows = vendorSeeds.map((vendor) => ({
    id: deterministicUuid(`vendor:${vendor.key}`),
    owner_account_id: ownerAccountId,
    owner_profile_id: ownerProfileId,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    trade_category: vendor.tradeCategory,
    preferred: vendor.preferred,
    active: true
  }));

  const { error: vendorError } = await admin
    .from("vendors")
    .upsert(vendorRows, { onConflict: "id" });
  if (vendorError) {
    throw new Error(`Failed to seed vendors: ${vendorError.message}`);
  }

  console.log(
    "✅ Seeded: 3 properties, 6 units, 3 tenants, 3 leases, 11 charges (including 2 late fees), 4 tickets, 2 listings, 2 applications, 3 vendors."
  );
}

seed().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
