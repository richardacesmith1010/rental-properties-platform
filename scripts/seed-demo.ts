import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createClient, type User } from "@supabase/supabase-js";

const DEMO_PASSWORD = "Demo123!";
const DEMO_DOMAIN = "@demo.domus.com";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvConfig(path.resolve(__dirname, "../apps/web"));

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
} as const;

type DemoRole = "owner" | "manager" | "tenant";

type AdminClient = ReturnType<typeof createClient>;

interface DemoUserSpec {
  key: string;
  email: string;
  fullName: string;
  nickname: string;
  role: DemoRole;
  totalXp: number;
  currentLevel: number;
  streakCount: number;
  streakLastDate: string | null;
}

interface DemoUser extends DemoUserSpec {
  id: string;
}

interface DemoProperty {
  id: string;
  name: string;
}

const demoUsers: DemoUserSpec[] = [
  {
    key: "owner",
    email: "owner@demo.domus.com",
    fullName: "Alex Rivera",
    nickname: "Alex",
    role: "owner",
    totalXp: 2500,
    currentLevel: 3,
    streakCount: 0,
    streakLastDate: null
  },
  {
    key: "manager",
    email: "manager@demo.domus.com",
    fullName: "Jordan Kim",
    nickname: "Jordan",
    role: "manager",
    totalXp: 800,
    currentLevel: 2,
    streakCount: 0,
    streakLastDate: null
  },
  {
    key: "tenant1",
    email: "tenant1@demo.domus.com",
    fullName: "Sam Johnson",
    nickname: "Sam",
    role: "tenant",
    totalXp: 1200,
    currentLevel: 2,
    streakCount: 6,
    streakLastDate: isoDate(new Date())
  },
  {
    key: "tenant2",
    email: "tenant2@demo.domus.com",
    fullName: "Pat Williams",
    nickname: "Pat",
    role: "tenant",
    totalXp: 300,
    currentLevel: 1,
    streakCount: 1,
    streakLastDate: isoDate(monthsAgo(1))
  },
  {
    key: "tenant3",
    email: "tenant3@demo.domus.com",
    fullName: "Casey Brown",
    nickname: "Casey",
    role: "tenant",
    totalXp: 50,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  }
];

function deterministicUuid(key: string) {
  const hex = createHash("sha1").update(`domus-demo:${key}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  const variant = Number.parseInt(chars[16] ?? "8", 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isoTimestamp(date: Date) {
  return date.toISOString();
}

function monthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

function monthsFromNow(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function listAuthUsers(admin: AdminClient): Promise<Map<string, User>> {
  const usersByEmail = new Map<string, User>();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    for (const user of users) {
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), user);
      }
    }

    if (users.length < 200) {
      break;
    }
  }

  return usersByEmail;
}

async function ensureDemoUser(
  admin: AdminClient,
  authUsersByEmail: Map<string, User>,
  spec: DemoUserSpec
): Promise<DemoUser> {
  const email = spec.email.toLowerCase();
  const existingAuth = authUsersByEmail.get(email);

  let userId = existingAuth?.id ?? null;
  if (existingAuth) {
    const { data, error } = await admin.auth.admin.updateUserById(existingAuth.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: spec.role,
        full_name: spec.fullName
      }
    });

    if (error) {
      throw new Error(`Failed to update demo user ${email}: ${error.message}`);
    }

    userId = data.user.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: spec.role,
        full_name: spec.fullName
      }
    });

    if (error || !data.user) {
      throw new Error(`Failed to create demo user ${email}: ${error?.message ?? "missing user"}`);
    }

    userId = data.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: spec.fullName,
      nickname: spec.nickname,
      role: spec.role,
      avatar_url: null,
      onboarding_completed_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(`Failed to upsert demo profile ${email}: ${profileError.message}`);
  }

  return { ...spec, id: userId };
}

async function upsertById(admin: AdminClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return;
  }

  const { error } = await admin.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`Failed to upsert ${table}: ${error.message}`);
  }
}

async function upsertByConflict(
  admin: AdminClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  if (rows.length === 0) {
    return;
  }

  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) {
    throw new Error(`Failed to upsert ${table}: ${error.message}`);
  }
}

async function fetchAchievementIds(admin: AdminClient, slugs: string[]) {
  const { data, error } = await admin
    .from("achievements")
    .select("id, slug")
    .in("slug", slugs);

  if (error) {
    throw new Error(`Failed to fetch achievements: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.slug, row.id]));
}

async function main() {
  const supabaseUrl = requireEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL"
  );
  const serviceRoleKey = requireEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const existingDemoProfiles = await admin
    .from("profiles")
    .select("id")
    .ilike("email", `%${DEMO_DOMAIN}`);

  if (existingDemoProfiles.error) {
    throw new Error(`Failed to check for existing demo profiles: ${existingDemoProfiles.error.message}`);
  }

  console.log(`${colors.cyan}Seeding Domus demo dataset...${colors.reset}`);
  if ((existingDemoProfiles.data ?? []).length > 0) {
    console.log(`${colors.yellow}Existing demo profiles found. Reusing deterministic records.${colors.reset}`);
  }

  const authUsersByEmail = await listAuthUsers(admin);
  const ensuredUsers = await Promise.all(
    demoUsers.map((spec) => ensureDemoUser(admin, authUsersByEmail, spec))
  );
  const userByKey = new Map(ensuredUsers.map((user) => [user.key, user]));

  const owner = userByKey.get("owner");
  const manager = userByKey.get("manager");
  const sam = userByKey.get("tenant1");
  const pat = userByKey.get("tenant2");
  const casey = userByKey.get("tenant3");

  if (!owner || !manager || !sam || !pat || !casey) {
    throw new Error("Failed to resolve seeded demo users.");
  }

  const ownershipAccountId = deterministicUuid("ownership-account");
  const { error: ownershipAccountError } = await admin.from("ownership_accounts").upsert(
    {
      id: ownershipAccountId,
      account_type: "llc",
      display_name: "Rivera Properties LLC",
      created_by_profile_id: owner.id
    },
    { onConflict: "id" }
  );
  if (ownershipAccountError) {
    throw new Error(`Failed to upsert ownership account: ${ownershipAccountError.message}`);
  }

  await upsertByConflict(admin, "ownership_account_members", [
    {
      account_id: ownershipAccountId,
      profile_id: owner.id,
      member_role: "owner",
      can_receive_critical_alerts: true,
      active: true
    }
  ], "account_id,profile_id");

  const properties: DemoProperty[] = [
    {
      id: deterministicUuid("property:riverside"),
      name: "Riverside Apartments"
    },
    {
      id: deterministicUuid("property:oak-park"),
      name: "Oak Park Duplex"
    }
  ];

  await upsertById(admin, "properties", [
    {
      id: properties[0].id,
      owner_profile_id: owner.id,
      owner_account_id: ownershipAccountId,
      name: properties[0].name,
      address_line1: "123 River St",
      city: "Denver",
      state: "CO",
      postal_code: "80205",
      management_fee_cents: 12000,
      active: true
    },
    {
      id: properties[1].id,
      owner_profile_id: owner.id,
      owner_account_id: ownershipAccountId,
      name: properties[1].name,
      address_line1: "456 Oak Ave",
      city: "Lakewood",
      state: "CO",
      postal_code: "80214",
      management_fee_cents: 9000,
      active: true
    }
  ]);

  await upsertByConflict(admin, "property_managers", properties.map((property) => ({
    property_id: property.id,
    manager_profile_id: manager.id,
    active: true
  })), "property_id,manager_profile_id");

  const units = [
    {
      id: deterministicUuid("unit:riverside-101"),
      property_id: properties[0].id,
      unit_number: "101",
      bedrooms: 2,
      bathrooms: 1,
      monthly_rent_cents: 150000,
      occupied: true,
      active: true
    },
    {
      id: deterministicUuid("unit:riverside-102"),
      property_id: properties[0].id,
      unit_number: "102",
      bedrooms: 2,
      bathrooms: 1,
      monthly_rent_cents: 135000,
      occupied: true,
      active: true
    },
    {
      id: deterministicUuid("unit:riverside-103"),
      property_id: properties[0].id,
      unit_number: "103",
      bedrooms: 1,
      bathrooms: 1,
      monthly_rent_cents: 125000,
      occupied: false,
      active: true
    },
    {
      id: deterministicUuid("unit:riverside-104"),
      property_id: properties[0].id,
      unit_number: "104",
      bedrooms: 3,
      bathrooms: 2,
      monthly_rent_cents: 175000,
      occupied: false,
      active: true
    },
    {
      id: deterministicUuid("unit:oak-a"),
      property_id: properties[1].id,
      unit_number: "A",
      bedrooms: 3,
      bathrooms: 2,
      monthly_rent_cents: 180000,
      occupied: true,
      active: true
    },
    {
      id: deterministicUuid("unit:oak-b"),
      property_id: properties[1].id,
      unit_number: "B",
      bedrooms: 2,
      bathrooms: 1,
      monthly_rent_cents: 165000,
      occupied: false,
      active: true
    }
  ];
  await upsertById(admin, "units", units);

  const activeLeaseStart = isoDate(monthsAgo(6));
  const activeLeaseEnd = isoDate(monthsFromNow(6));
  const patLeaseStart = isoDate(monthsAgo(2));
  const caseyLeaseStart = isoDate(monthsAgo(1));
  const expiredLeaseStart = isoDate(monthsAgo(10));
  const expiredLeaseEnd = isoDate(monthsAgo(1));

  const leases = [
    {
      id: deterministicUuid("lease:sam-101"),
      unit_id: units[0].id,
      tenant_profile_id: sam.id,
      start_date: activeLeaseStart,
      end_date: activeLeaseEnd,
      monthly_rent_cents: 150000,
      deposit_cents: 150000,
      due_day_of_month: 1,
      late_fee_cents: 7500,
      grace_period_days: 5,
      lease_status: "active",
      active: true
    },
    {
      id: deterministicUuid("lease:pat-102"),
      unit_id: units[1].id,
      tenant_profile_id: pat.id,
      start_date: patLeaseStart,
      end_date: isoDate(monthsFromNow(10)),
      monthly_rent_cents: 135000,
      deposit_cents: 135000,
      due_day_of_month: 1,
      late_fee_cents: 6750,
      grace_period_days: 5,
      lease_status: "active",
      active: true
    },
    {
      id: deterministicUuid("lease:casey-a"),
      unit_id: units[4].id,
      tenant_profile_id: casey.id,
      start_date: caseyLeaseStart,
      end_date: isoDate(monthsFromNow(11)),
      monthly_rent_cents: 180000,
      deposit_cents: 180000,
      due_day_of_month: 1,
      late_fee_cents: 9000,
      grace_period_days: 5,
      lease_status: "active",
      active: true
    },
    {
      id: deterministicUuid("lease:pat-103-expired"),
      unit_id: units[2].id,
      tenant_profile_id: pat.id,
      start_date: expiredLeaseStart,
      end_date: expiredLeaseEnd,
      monthly_rent_cents: 125000,
      deposit_cents: 125000,
      due_day_of_month: 1,
      late_fee_cents: 6250,
      grace_period_days: 5,
      lease_status: "expired",
      active: false,
      terminated_at: isoTimestamp(monthsAgo(1)),
      termination_reason: "Prior lease ended after move-out"
    }
  ];
  await upsertById(admin, "leases", leases);

  const samChargeMonths = Array.from({ length: 6 }, (_, index) => {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() - (5 - index));
    dueDate.setDate(1);
    return dueDate;
  });

  const rentCharges: Record<string, unknown>[] = samChargeMonths.map((dueDate, index) => ({
    id: deterministicUuid(`charge:sam:${index + 1}`),
    lease_id: leases[0].id,
    due_date: isoDate(dueDate),
    amount_cents: 150000,
    status: "paid",
    category: "rent",
    created_at: isoTimestamp(new Date(dueDate))
  }));

  const lastMonthPatDue = new Date();
  lastMonthPatDue.setMonth(lastMonthPatDue.getMonth() - 1);
  lastMonthPatDue.setDate(1);
  const patOverdueDate = daysAgo(5);
  const caseyUpcomingDate = daysFromNow(3);

  rentCharges.push(
    {
      id: deterministicUuid("charge:pat:paid"),
      lease_id: leases[1].id,
      due_date: isoDate(lastMonthPatDue),
      amount_cents: 135000,
      status: "paid",
      category: "rent",
      created_at: isoTimestamp(lastMonthPatDue)
    },
    {
      id: deterministicUuid("charge:pat:late"),
      lease_id: leases[1].id,
      due_date: isoDate(patOverdueDate),
      amount_cents: 135000,
      status: "late",
      category: "rent",
      created_at: isoTimestamp(daysAgo(35))
    },
    {
      id: deterministicUuid("charge:casey:pending"),
      lease_id: leases[2].id,
      due_date: isoDate(caseyUpcomingDate),
      amount_cents: 180000,
      status: "pending",
      category: "rent",
      created_at: isoTimestamp(daysAgo(2))
    }
  );

  await upsertById(admin, "rent_charges", rentCharges);

  const payments = samChargeMonths.map((dueDate, index) => ({
    id: deterministicUuid(`payment:sam:${index + 1}`),
    rent_charge_id: deterministicUuid(`charge:sam:${index + 1}`),
    amount_cents: 150000,
    method: "card",
    reference_note: "Demo seeded card payment",
    paid_at: isoTimestamp(dueDate)
  }));

  payments.push({
    id: deterministicUuid("payment:pat:paid"),
    rent_charge_id: deterministicUuid("charge:pat:paid"),
    amount_cents: 135000,
    method: "card",
    reference_note: "Demo seeded card payment",
    paid_at: isoTimestamp(lastMonthPatDue)
  });

  await upsertById(admin, "payments", payments);

  const vendors = [
    {
      id: deterministicUuid("vendor:hvac"),
      owner_account_id: ownershipAccountId,
      owner_profile_id: owner.id,
      name: "CoolAir HVAC",
      email: "dispatch@coolair.demo.domus.com",
      phone: "555-0101",
      trade_category: "hvac",
      preferred: true,
      active: true
    },
    {
      id: deterministicUuid("vendor:plumbing"),
      owner_account_id: ownershipAccountId,
      owner_profile_id: owner.id,
      name: "River City Plumbing",
      email: "help@rivercity.demo.domus.com",
      phone: "555-0102",
      trade_category: "plumbing",
      preferred: true,
      active: true
    }
  ];
  await upsertById(admin, "vendors", vendors);

  const tickets = [
    {
      id: deterministicUuid("ticket:faucet"),
      property_id: properties[0].id,
      unit_id: units[0].id,
      tenant_profile_id: sam.id,
      title: "Leaky faucet in kitchen",
      description: "The kitchen faucet drips continuously under the handle.",
      priority: "medium",
      status: "resolved",
      actual_cost_cents: 8500,
      created_at: isoTimestamp(daysAgo(14)),
      resolved_at: isoTimestamp(daysAgo(9))
    },
    {
      id: deterministicUuid("ticket:ac"),
      property_id: properties[0].id,
      unit_id: units[1].id,
      tenant_profile_id: pat.id,
      title: "AC not cooling",
      description: "The thermostat is set correctly but the unit is blowing warm air.",
      priority: "high",
      status: "in_progress",
      actual_cost_cents: null,
      created_at: isoTimestamp(daysAgo(3)),
      resolved_at: null
    },
    {
      id: deterministicUuid("ticket:lock"),
      property_id: properties[1].id,
      unit_id: units[4].id,
      tenant_profile_id: casey.id,
      title: "Front door lock sticking",
      description: "The front door deadbolt sticks when turning from the inside.",
      priority: "medium",
      status: "open",
      actual_cost_cents: null,
      created_at: isoTimestamp(daysAgo(1)),
      resolved_at: null
    },
    {
      id: deterministicUuid("ticket:light"),
      property_id: properties[0].id,
      unit_id: units[0].id,
      tenant_profile_id: sam.id,
      title: "Hallway light out",
      description: "Shared hallway fixture needs a new bulb or ballast.",
      priority: "low",
      status: "closed",
      actual_cost_cents: 2500,
      created_at: isoTimestamp(daysAgo(32)),
      resolved_at: isoTimestamp(daysAgo(28))
    }
  ];
  await upsertById(admin, "maintenance_tickets", tickets);

  await upsertById(admin, "maintenance_assignments", [
    {
      id: deterministicUuid("assignment:ac"),
      ticket_id: tickets[1].id,
      vendor_id: vendors[0].id,
      assigned_by_profile_id: manager.id,
      assigned_at: isoTimestamp(daysAgo(2)),
      status: "assigned"
    }
  ]);

  await upsertById(admin, "maintenance_status_history", [
    {
      id: deterministicUuid("history:faucet:submitted"),
      ticket_id: tickets[0].id,
      from_status: null,
      to_status: "submitted",
      changed_by: sam.id,
      notes: null,
      created_at: isoTimestamp(daysAgo(14))
    },
    {
      id: deterministicUuid("history:faucet:reviewed"),
      ticket_id: tickets[0].id,
      from_status: "submitted",
      to_status: "reviewed",
      changed_by: manager.id,
      notes: "Reviewed and scheduled plumber.",
      created_at: isoTimestamp(daysAgo(13))
    },
    {
      id: deterministicUuid("history:faucet:in-progress"),
      ticket_id: tickets[0].id,
      from_status: "reviewed",
      to_status: "in_progress",
      changed_by: manager.id,
      notes: "Vendor is on site.",
      created_at: isoTimestamp(daysAgo(11))
    },
    {
      id: deterministicUuid("history:faucet:resolved"),
      ticket_id: tickets[0].id,
      from_status: "in_progress",
      to_status: "resolved",
      changed_by: manager.id,
      notes: "Cartridge replaced and leak fixed.",
      created_at: isoTimestamp(daysAgo(9))
    },
    {
      id: deterministicUuid("history:ac:submitted"),
      ticket_id: tickets[1].id,
      from_status: null,
      to_status: "submitted",
      changed_by: pat.id,
      notes: null,
      created_at: isoTimestamp(daysAgo(3))
    },
    {
      id: deterministicUuid("history:ac:in-progress"),
      ticket_id: tickets[1].id,
      from_status: "submitted",
      to_status: "in_progress",
      changed_by: manager.id,
      notes: "Technician assigned and diagnostic visit scheduled.",
      created_at: isoTimestamp(daysAgo(2))
    },
    {
      id: deterministicUuid("history:lock:submitted"),
      ticket_id: tickets[2].id,
      from_status: null,
      to_status: "submitted",
      changed_by: casey.id,
      notes: null,
      created_at: isoTimestamp(daysAgo(1))
    },
    {
      id: deterministicUuid("history:light:submitted"),
      ticket_id: tickets[3].id,
      from_status: null,
      to_status: "submitted",
      changed_by: sam.id,
      notes: null,
      created_at: isoTimestamp(daysAgo(32))
    },
    {
      id: deterministicUuid("history:light:resolved"),
      ticket_id: tickets[3].id,
      from_status: "submitted",
      to_status: "resolved",
      changed_by: manager.id,
      notes: "Fixture repaired.",
      created_at: isoTimestamp(daysAgo(29))
    },
    {
      id: deterministicUuid("history:light:closed"),
      ticket_id: tickets[3].id,
      from_status: "resolved",
      to_status: "closed",
      changed_by: manager.id,
      notes: "Tenant confirmed everything looks good.",
      created_at: isoTimestamp(daysAgo(28))
    }
  ]);

  await upsertById(admin, "property_expenses", [
    {
      id: deterministicUuid("expense:plumbing"),
      property_id: properties[0].id,
      created_by_profile_id: owner.id,
      category: "maintenance",
      description: "Plumbing repair",
      amount_cents: 35000,
      expense_date: isoDate(daysAgo(20)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: vendors[1].id,
      receipt_file_id: null
    },
    {
      id: deterministicUuid("expense:lawn"),
      property_id: properties[0].id,
      created_by_profile_id: owner.id,
      category: "maintenance",
      description: "Lawn service",
      amount_cents: 15000,
      expense_date: isoDate(daysAgo(15)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: null,
      receipt_file_id: null
    },
    {
      id: deterministicUuid("expense:insurance"),
      property_id: properties[0].id,
      created_by_profile_id: owner.id,
      category: "insurance",
      description: "Property insurance",
      amount_cents: 240000,
      expense_date: isoDate(daysAgo(45)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: null,
      receipt_file_id: null
    },
    {
      id: deterministicUuid("expense:dishwasher"),
      property_id: properties[0].id,
      created_by_profile_id: owner.id,
      category: "repair",
      description: "New dishwasher for Unit 103",
      amount_cents: 65000,
      expense_date: isoDate(daysAgo(40)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: null,
      receipt_file_id: null
    },
    {
      id: deterministicUuid("expense:pest"),
      property_id: properties[1].id,
      created_by_profile_id: owner.id,
      category: "maintenance",
      description: "Pest control",
      amount_cents: 20000,
      expense_date: isoDate(daysAgo(10)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: null,
      receipt_file_id: null
    },
    {
      id: deterministicUuid("expense:taxes"),
      property_id: properties[1].id,
      created_by_profile_id: owner.id,
      category: "property_tax",
      description: "Property tax Q1",
      amount_cents: 350000,
      expense_date: isoDate(daysAgo(60)),
      recurring: false,
      recurring_frequency: null,
      vendor_id: null,
      receipt_file_id: null
    }
  ]);

  await upsertById(admin, "notifications", [
    {
      id: deterministicUuid("notification:owner:ticket"),
      recipient_profile_id: owner.id,
      type: "new_ticket",
      title: "New maintenance request",
      body: "AC not cooling was reported in Unit 102.",
      entity_type: "maintenance_ticket",
      entity_id: tickets[1].id,
      created_at: isoTimestamp(daysAgo(3)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:owner:payment"),
      recipient_profile_id: owner.id,
      type: "payment_recorded",
      title: "Rent payment received",
      body: "Sam Johnson paid rent for Unit 101.",
      entity_type: "rent_charge",
      entity_id: deterministicUuid("charge:sam:6"),
      created_at: isoTimestamp(daysAgo(12)),
      read_at: isoTimestamp(daysAgo(11))
    },
    {
      id: deterministicUuid("notification:manager:ticket"),
      recipient_profile_id: manager.id,
      type: "new_ticket",
      title: "Ticket requires follow-up",
      body: "Front door lock sticking is waiting for review.",
      entity_type: "maintenance_ticket",
      entity_id: tickets[2].id,
      created_at: isoTimestamp(daysAgo(1)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:manager:lease"),
      recipient_profile_id: manager.id,
      type: "rent_due_reminder",
      title: "Lease follow-up needed",
      body: "Review the recent turnover status for Unit 103.",
      entity_type: "lease",
      entity_id: leases[3].id,
      created_at: isoTimestamp(daysAgo(20)),
      read_at: isoTimestamp(daysAgo(18))
    },
    {
      id: deterministicUuid("notification:sam:payment"),
      recipient_profile_id: sam.id,
      type: "payment_recorded",
      title: "Payment received",
      body: "Your latest rent payment was recorded successfully.",
      entity_type: "rent_charge",
      entity_id: deterministicUuid("charge:sam:6"),
      created_at: isoTimestamp(daysAgo(12)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:sam:ticket"),
      recipient_profile_id: sam.id,
      type: "ticket_resolved",
      title: "Maintenance request resolved",
      body: "Leaky faucet in kitchen has been resolved.",
      entity_type: "maintenance_ticket",
      entity_id: tickets[0].id,
      created_at: isoTimestamp(daysAgo(9)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:pat:late"),
      recipient_profile_id: pat.id,
      type: "late_rent",
      title: "Rent is overdue",
      body: "Your latest rent charge is 5 days overdue.",
      entity_type: "rent_charge",
      entity_id: deterministicUuid("charge:pat:late"),
      created_at: isoTimestamp(daysAgo(1)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:pat:ticket"),
      recipient_profile_id: pat.id,
      type: "new_ticket",
      title: "Maintenance request is in progress",
      body: "HVAC technician has been assigned to your ticket.",
      entity_type: "maintenance_ticket",
      entity_id: tickets[1].id,
      created_at: isoTimestamp(daysAgo(2)),
      read_at: null
    },
    {
      id: deterministicUuid("notification:casey:reminder"),
      recipient_profile_id: casey.id,
      type: "rent_due_reminder",
      title: "Rent due soon",
      body: "Your rent is due in 3 days. Pay now to keep your streak going.",
      entity_type: "rent_charge",
      entity_id: deterministicUuid("charge:casey:pending"),
      created_at: isoTimestamp(new Date()),
      read_at: null
    },
    {
      id: deterministicUuid("notification:casey:achievement"),
      recipient_profile_id: casey.id,
      type: "new_ticket",
      title: "Maintenance request received",
      body: "Your front door lock request has been received by the property team.",
      entity_type: "maintenance_ticket",
      entity_id: tickets[2].id,
      created_at: isoTimestamp(daysAgo(1)),
      read_at: null
    }
  ]);

  const xpEvents = [
    ...samChargeMonths.map((dueDate, index) => ({
      id: deterministicUuid(`xp:sam:rent:${index + 1}`),
      user_id: sam.id,
      event_type: "rent_paid_on_time",
      xp_amount: 100,
      description: "Rent paid on time.",
      metadata: { charge_id: deterministicUuid(`charge:sam:${index + 1}`) },
      created_at: isoTimestamp(dueDate)
    })),
    {
      id: deterministicUuid("xp:sam:first-ticket"),
      user_id: sam.id,
      event_type: "ticket_submitted",
      xp_amount: 25,
      description: "Submitted first maintenance ticket.",
      metadata: { ticket_id: tickets[0].id },
      created_at: isoTimestamp(daysAgo(14))
    },
    {
      id: deterministicUuid("xp:sam:achievement:first-payment"),
      user_id: sam.id,
      event_type: "achievement_first_payment",
      xp_amount: 100,
      description: "Achievement unlocked: First Payment.",
      metadata: {},
      created_at: isoTimestamp(daysAgo(150))
    },
    {
      id: deterministicUuid("xp:sam:achievement:streak-3"),
      user_id: sam.id,
      event_type: "achievement_streak_3",
      xp_amount: 200,
      description: "Achievement unlocked: Hot Streak.",
      metadata: {},
      created_at: isoTimestamp(daysAgo(90))
    },
    {
      id: deterministicUuid("xp:sam:achievement:streak-6"),
      user_id: sam.id,
      event_type: "achievement_streak_6",
      xp_amount: 500,
      description: "Achievement unlocked: On Fire.",
      metadata: {},
      created_at: isoTimestamp(daysAgo(1))
    },
    {
      id: deterministicUuid("xp:sam:achievement:first-ticket"),
      user_id: sam.id,
      event_type: "achievement_first_ticket",
      xp_amount: 50,
      description: "Achievement unlocked: First Report.",
      metadata: {},
      created_at: isoTimestamp(daysAgo(14))
    },
    {
      id: deterministicUuid("xp:pat:rent"),
      user_id: pat.id,
      event_type: "rent_paid_on_time",
      xp_amount: 100,
      description: "Rent paid on time.",
      metadata: { charge_id: deterministicUuid("charge:pat:paid") },
      created_at: isoTimestamp(lastMonthPatDue)
    },
    {
      id: deterministicUuid("xp:pat:achievement:first-payment"),
      user_id: pat.id,
      event_type: "achievement_first_payment",
      xp_amount: 100,
      description: "Achievement unlocked: First Payment.",
      metadata: {},
      created_at: isoTimestamp(lastMonthPatDue)
    },
    {
      id: deterministicUuid("xp:casey:first-ticket"),
      user_id: casey.id,
      event_type: "ticket_submitted",
      xp_amount: 25,
      description: "Submitted first maintenance ticket.",
      metadata: { ticket_id: tickets[2].id },
      created_at: isoTimestamp(daysAgo(1))
    },
    {
      id: deterministicUuid("xp:owner:first-property"),
      user_id: owner.id,
      event_type: "property_added",
      xp_amount: 200,
      description: "First property added.",
      metadata: { property_id: properties[0].id },
      created_at: isoTimestamp(daysAgo(180))
    }
  ];
  await upsertById(admin, "xp_events", xpEvents);

  await upsertByConflict(admin, "user_gamification", ensuredUsers.map((user) => ({
    user_id: user.id,
    total_xp: user.totalXp,
    current_level: user.currentLevel,
    streak_count: user.streakCount,
    streak_last_date: user.streakLastDate
  })), "user_id");

  const achievementIds = await fetchAchievementIds(admin, [
    "first_payment",
    "streak_3",
    "streak_6",
    "first_ticket",
    "first_property"
  ]);

  await upsertByConflict(admin, "user_achievements", [
    {
      id: deterministicUuid("user-achievement:sam:first-payment"),
      user_id: sam.id,
      achievement_id: achievementIds.get("first_payment"),
      earned_at: isoTimestamp(daysAgo(150))
    },
    {
      id: deterministicUuid("user-achievement:sam:streak-3"),
      user_id: sam.id,
      achievement_id: achievementIds.get("streak_3"),
      earned_at: isoTimestamp(daysAgo(90))
    },
    {
      id: deterministicUuid("user-achievement:sam:streak-6"),
      user_id: sam.id,
      achievement_id: achievementIds.get("streak_6"),
      earned_at: isoTimestamp(daysAgo(1))
    },
    {
      id: deterministicUuid("user-achievement:sam:first-ticket"),
      user_id: sam.id,
      achievement_id: achievementIds.get("first_ticket"),
      earned_at: isoTimestamp(daysAgo(14))
    },
    {
      id: deterministicUuid("user-achievement:pat:first-payment"),
      user_id: pat.id,
      achievement_id: achievementIds.get("first_payment"),
      earned_at: isoTimestamp(lastMonthPatDue)
    },
    {
      id: deterministicUuid("user-achievement:owner:first-property"),
      user_id: owner.id,
      achievement_id: achievementIds.get("first_property"),
      earned_at: isoTimestamp(daysAgo(180))
    }
  ].filter((row) => row.achievement_id), "user_id,achievement_id");

  console.log(`${colors.green}Demo data ready.${colors.reset}`);
  console.log(`${colors.magenta}Users:${colors.reset} 5 demo accounts (password: ${DEMO_PASSWORD})`);
  console.log(`${colors.magenta}Portfolio:${colors.reset} 2 properties, 6 units, 4 leases`);
  console.log(`${colors.magenta}Financials:${colors.reset} ${rentCharges.length} charges, ${payments.length} payments, 6 expenses`);
  console.log(`${colors.magenta}Operations:${colors.reset} 4 maintenance tickets, 10 notifications, ${xpEvents.length} XP events`);
}

main().catch((error) => {
  console.error(`${colors.yellow}Seed failed:${colors.reset}`, error);
  process.exitCode = 1;
});
