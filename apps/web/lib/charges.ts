import { createClient } from "@/lib/supabase/server";
import { createNotificationWithDelivery, notifyOwnerMembersForProperty } from "@/lib/notifications";
import { getAdministeredPropertyIds } from "@/lib/property-access";

type SupabaseLikeClient = {
  from: (table: string) => any;
};

interface UnitRow {
  id: string;
  property_id: string;
}

interface LeaseRow {
  id: string;
  start_date: string;
  end_date: string;
  due_day_of_month: number;
  monthly_rent_cents: number;
  unit_id?: string;
  tenant_profile_id?: string | null;
}

interface ExistingChargeRow {
  lease_id: string;
  due_date: string;
}

interface LateChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
}

interface LateLeaseRow {
  id: string;
  tenant_profile_id: string | null;
  unit_id: string;
}

interface ProfileEmailRow {
  id: string;
  email: string | null;
}

interface PropertyIdRow {
  id: string;
}

interface PropertyManagerAssignmentRow {
  property_id: string;
}

interface OwnershipMembershipRow {
  account_id: string;
}

interface ProfileIdRow {
  id: string;
}

function getCandidateMonths() {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();

  return [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
    { year: baseMonth >= 10 ? baseYear + 1 : baseYear, month: (baseMonth + 2) % 12 }
  ];
}

function nextDueDateOnOrAfterToday(dueDayOfMonth: number, todayIso: string) {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();
  const monthStart = new Date(Date.UTC(baseYear, baseMonth, 1));

  for (let i = 0; i < 12; i += 1) {
    const year = monthStart.getUTCFullYear() + Math.floor((monthStart.getUTCMonth() + i) / 12);
    const month = (monthStart.getUTCMonth() + i) % 12;
    const dueDate = new Date(Date.UTC(year, month, dueDayOfMonth));
    const dueDateIso = dueDate.toISOString().slice(0, 10);
    if (dueDateIso >= todayIso) {
      return dueDateIso;
    }
  }

  return todayIso;
}

function buildDueDatesByLeaseId(leases: LeaseRow[], todayIso: string) {
  const candidateMonths = getCandidateMonths();
  const dueDatesByLeaseId = new Map<string, string[]>();

  for (const lease of leases) {
    const dueDates: string[] = [];

    for (const candidate of candidateMonths) {
      const dueDate = new Date(Date.UTC(candidate.year, candidate.month, lease.due_day_of_month));
      const dueDateIso = dueDate.toISOString().slice(0, 10);
      if (dueDateIso >= lease.start_date && dueDateIso <= lease.end_date) {
        dueDates.push(dueDateIso);
      }
    }

    if (dueDates.length > 0) {
      dueDatesByLeaseId.set(lease.id, dueDates);
      continue;
    }

    if (todayIso > lease.end_date) {
      continue;
    }

    const fallbackDueDate = nextDueDateOnOrAfterToday(lease.due_day_of_month, todayIso);
    if (fallbackDueDate >= lease.start_date && fallbackDueDate <= lease.end_date) {
      dueDatesByLeaseId.set(lease.id, [fallbackDueDate]);
      continue;
    }

    if (todayIso >= lease.start_date && todayIso <= lease.end_date) {
      dueDatesByLeaseId.set(lease.id, [todayIso]);
    }
  }

  return dueDatesByLeaseId;
}

async function generateMonthlyChargesForPropertyIdsWithClient(
  supabase: SupabaseLikeClient,
  propertyIds: string[]
): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10);

  if (propertyIds.length === 0) {
    return "No properties found for your account.";
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);

  const unitRows = (units ?? []) as UnitRow[];
  const unitIds = unitRows.map((unit) => unit.id);
  if (unitIds.length === 0) {
    return "No units found. Add a unit first.";
  }

  const { data: leases } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, start_date, end_date, due_day_of_month, monthly_rent_cents")
    .in("unit_id", unitIds)
    .eq("active", true);

  const leaseRows = (leases ?? []) as LeaseRow[];
  if (leaseRows.length === 0) {
    return "No active leases found. Create an active lease first.";
  }

  const leaseIds = leaseRows.map((lease) => lease.id);
  const dueDatesByLeaseId = buildDueDatesByLeaseId(leaseRows, todayIso);

  if (dueDatesByLeaseId.size === 0) {
    return "No billable dates available for active leases.";
  }

  const targetDueDates = Array.from(new Set(Array.from(dueDatesByLeaseId.values()).flat()));
  const { data: existingCharges } = await supabase
    .from("rent_charges")
    .select("lease_id, due_date")
    .in("lease_id", Array.from(dueDatesByLeaseId.keys()))
    .in("due_date", targetDueDates);

  const existingKey = new Set(
    ((existingCharges ?? []) as ExistingChargeRow[]).map((charge) => `${charge.lease_id}::${charge.due_date}`)
  );

  const inserts = leaseRows.flatMap((lease) => {
    const dueDates = dueDatesByLeaseId.get(lease.id) ?? [];
    return dueDates
      .map((dueDate) => {
        const key = `${lease.id}::${dueDate}`;
        if (existingKey.has(key)) {
          return null;
        }
        return {
          lease_id: lease.id,
          due_date: dueDate,
          amount_cents: lease.monthly_rent_cents,
          status: "pending" as const
        };
      })
      .filter(
        (row): row is { lease_id: string; due_date: string; amount_cents: number; status: "pending" } => row !== null
      );
  });

  if (inserts.length > 0) {
    await supabase.from("rent_charges").insert(inserts);
  }

  const { data: toMarkLate } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date")
    .in("lease_id", leaseIds)
    .eq("status", "pending")
    .lt("due_date", todayIso);

  await supabase
    .from("rent_charges")
    .update({ status: "late" })
    .in("lease_id", leaseIds)
    .eq("status", "pending")
    .lt("due_date", todayIso);

  if ((toMarkLate ?? []).length > 0) {
    const lateChargeRows = (toMarkLate ?? []) as LateChargeRow[];
    const lateLeaseIds = Array.from(new Set(lateChargeRows.map((charge) => charge.lease_id)));

    const { data: lateLeases } = await supabase
      .from("leases")
      .select("id, tenant_profile_id, unit_id")
      .in("id", lateLeaseIds);

    const lateLeaseRows = (lateLeases ?? []) as LateLeaseRow[];
    const leaseById = new Map(lateLeaseRows.map((lease) => [lease.id, lease]));
    const lateUnitIds = Array.from(new Set(lateLeaseRows.map((lease) => lease.unit_id)));

    const { data: lateUnits } = lateUnitIds.length
      ? await supabase
          .from("units")
          .select("id, property_id")
          .in("id", lateUnitIds)
      : { data: [] as UnitRow[] };

    const lateUnitRows = (lateUnits ?? []) as UnitRow[];
    const propertyIdByUnitId = new Map(lateUnitRows.map((unit) => [unit.id, unit.property_id]));
    const tenantIds = Array.from(
      new Set(
        lateLeaseRows
          .map((lease) => lease.tenant_profile_id)
          .filter((id): id is string => !!id)
      )
    );

    let emailByTenantId = new Map<string, string | null>();
    if (tenantIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", tenantIds);

      emailByTenantId = new Map(
        ((profiles ?? []) as ProfileEmailRow[]).map((profile) => [profile.id, profile.email ?? null])
      );
    }

    for (const charge of lateChargeRows) {
      const lease = leaseById.get(charge.lease_id);
      const tenantId = lease?.tenant_profile_id ?? null;
      const propertyId = lease?.unit_id ? propertyIdByUnitId.get(lease.unit_id) ?? null : null;

      if (tenantId) {
        await createNotificationWithDelivery({
          recipientProfileId: tenantId,
          recipientEmail: emailByTenantId.get(tenantId) ?? null,
          type: "late_rent",
          title: "Rent payment overdue",
          body: `Your rent charge due on ${charge.due_date} is now marked late.`,
          entityType: "rent_charge",
          entityId: charge.id
        });
      }

      if (propertyId) {
        await notifyOwnerMembersForProperty({
          propertyId,
          type: "late_rent",
          title: "Rent charge marked late",
          body: `A rent charge due on ${charge.due_date} is now late.`,
          entityType: "rent_charge",
          entityId: charge.id
        });
      }
    }
  }

  return inserts.length > 0
    ? `Generated ${inserts.length} new charge${inserts.length === 1 ? "" : "s"}.`
    : "No new charges generated (already up to date).";
}

async function getPropertyIdsForUserWithClient(
  supabase: SupabaseLikeClient,
  userId: string
): Promise<string[]> {
  const propertyIds = new Set<string>();

  const { data: legacyOwnedProperties } = await supabase
    .from("properties")
    .select("id")
    .eq("owner_profile_id", userId);

  for (const property of (legacyOwnedProperties ?? []) as PropertyIdRow[]) {
    propertyIds.add(property.id);
  }

  const { data: managerAssignments } = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  for (const assignment of (managerAssignments ?? []) as PropertyManagerAssignmentRow[]) {
    propertyIds.add(assignment.property_id);
  }

  const { data: ownerAccountMemberships } = await supabase
    .from("ownership_account_members")
    .select("account_id")
    .eq("profile_id", userId)
    .eq("member_role", "owner")
    .eq("active", true);

  const ownerAccountIds = ((ownerAccountMemberships ?? []) as OwnershipMembershipRow[]).map((row) => row.account_id);
  if (ownerAccountIds.length > 0) {
    const { data: accountProperties } = await supabase
      .from("properties")
      .select("id")
      .in("owner_account_id", ownerAccountIds);

    for (const property of (accountProperties ?? []) as PropertyIdRow[]) {
      propertyIds.add(property.id);
    }
  }

  return Array.from(propertyIds);
}

export async function generateMonthlyChargesForOwner(ownerUserId: string): Promise<string> {
  const supabase = createClient();

  const propertyIds = await getAdministeredPropertyIds(ownerUserId);
  return generateMonthlyChargesForPropertyIdsWithClient(supabase, propertyIds);
}

export async function generateMonthlyChargesForAllOwners(): Promise<string> {
  const supabase = createClient();
  return generateMonthlyChargesForAllOwnersWithClient(supabase);
}

export async function generateMonthlyChargesForAllOwnersWithClient(supabase: SupabaseLikeClient): Promise<string> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["owner", "manager"]);

  const userIds = ((profiles ?? []) as ProfileIdRow[]).map((profile) => profile.id);
  if (userIds.length === 0) {
    return "No operators found.";
  }

  let generatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let processedCount = 0;

  for (const userId of userIds) {
    const propertyIds = await getPropertyIdsForUserWithClient(supabase, userId);
    if (propertyIds.length === 0) {
      continue;
    }

    processedCount += 1;
    const message = await generateMonthlyChargesForPropertyIdsWithClient(supabase, propertyIds);
    if (message.startsWith("Generated")) {
      generatedCount += 1;
    } else if (message.startsWith("No new charges generated")) {
      unchangedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return `Operators processed: ${processedCount}. Generated: ${generatedCount}. Unchanged: ${unchangedCount}. Skipped: ${skippedCount}.`;
}
