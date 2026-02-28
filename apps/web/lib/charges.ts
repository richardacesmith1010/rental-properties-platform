import { createClient } from "@/lib/supabase/server";
import { createNotificationWithDelivery } from "@/lib/notifications";

type SupabaseLikeClient = {
  from: (table: string) => any;
};

interface PropertyRow {
  id: string;
  owner_profile_id: string;
}

interface UnitRow {
  id: string;
}

interface LeaseRow {
  id: string;
  start_date: string;
  end_date: string;
  due_day_of_month: number;
  monthly_rent_cents: number;
}

interface ExistingChargeRow {
  lease_id: string;
  due_date: string;
}

interface LateChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
}

interface LeaseTenantRow {
  id: string;
  tenant_profile_id: string;
}

interface ProfileEmailRow {
  id: string;
  email: string | null;
}

async function generateMonthlyChargesForOwnerWithClient(
  supabase: SupabaseLikeClient,
  ownerUserId: string
): Promise<string> {

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();

  const { data: properties } = await supabase
    .from("properties")
    .select("id")
    .eq("owner_profile_id", ownerUserId);

  const propertyIds = ((properties ?? []) as PropertyRow[]).map((property) => property.id);
  if (propertyIds.length === 0) {
    return "No properties found for your owner account.";
  }

  const { data: units } = await supabase
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  const unitIds = ((units ?? []) as UnitRow[]).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return "No units found. Add a unit first.";
  }

  const { data: leases } = await supabase
    .from("leases")
    .select("id, start_date, end_date, due_day_of_month, monthly_rent_cents")
    .in("unit_id", unitIds)
    .eq("active", true);

  const leaseRows = (leases ?? []) as LeaseRow[];
  if (leaseRows.length === 0) {
    return "No active leases found. Create an active lease first.";
  }

  const leaseIds = leaseRows.map((lease) => lease.id);

  const candidateMonths = [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
    { year: baseMonth >= 10 ? baseYear + 1 : baseYear, month: (baseMonth + 2) % 12 }
  ];

  const nextDueDateOnOrAfterToday = (dueDayOfMonth: number) => {
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
  };

  const dueDatesByLeaseId = new Map<string, string[]>();
  for (const lease of leaseRows) {
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
    } else if (todayIso <= lease.end_date) {
      const fallbackDueDate = nextDueDateOnOrAfterToday(lease.due_day_of_month);
      if (fallbackDueDate >= lease.start_date && fallbackDueDate <= lease.end_date) {
        dueDatesByLeaseId.set(lease.id, [fallbackDueDate]);
      } else if (todayIso >= lease.start_date && todayIso <= lease.end_date) {
        dueDatesByLeaseId.set(lease.id, [todayIso]);
      }
    }
  }

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
    .select("id, lease_id, due_date, amount_cents")
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
      .select("id, tenant_profile_id")
      .in("id", lateLeaseIds);

    const leaseRows = (lateLeases ?? []) as LeaseTenantRow[];
    const tenantIdByLeaseId = new Map(leaseRows.map((lease) => [lease.id, lease.tenant_profile_id]));
    const tenantIds = Array.from(
      new Set(
        leaseRows
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
      const tenantId = tenantIdByLeaseId.get(charge.lease_id);
      if (!tenantId) {
        continue;
      }

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
  }

  return inserts.length > 0
    ? `Generated ${inserts.length} new charge${inserts.length === 1 ? "" : "s"}.`
    : "No new charges generated (already up to date).";
}

export async function generateMonthlyChargesForOwner(ownerUserId: string): Promise<string> {
  const supabase = createClient();
  return generateMonthlyChargesForOwnerWithClient(supabase, ownerUserId);
}

export async function generateMonthlyChargesForAllOwners(): Promise<string> {
  const supabase = createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("owner_profile_id");

  const ownerIds = Array.from(new Set((properties ?? []).map((property) => property.owner_profile_id)));

  if (ownerIds.length === 0) {
    return "No owners with properties found.";
  }

  let generatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;

  for (const ownerId of ownerIds) {
    const message = await generateMonthlyChargesForOwnerWithClient(supabase, ownerId);
    if (message.startsWith("Generated")) {
      generatedCount += 1;
    } else if (message.startsWith("No new charges generated")) {
      unchangedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return `Owners processed: ${ownerIds.length}. Generated: ${generatedCount}. Unchanged: ${unchangedCount}. Skipped: ${skippedCount}.`;
}

export async function generateMonthlyChargesForAllOwnersWithClient(supabase: SupabaseLikeClient): Promise<string> {
  const { data: properties } = await supabase
    .from("properties")
    .select("owner_profile_id");

  const ownerIds = Array.from(new Set(((properties ?? []) as PropertyRow[]).map((property) => property.owner_profile_id)));

  if (ownerIds.length === 0) {
    return "No owners with properties found.";
  }

  let generatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;

  for (const ownerId of ownerIds) {
    const message = await generateMonthlyChargesForOwnerWithClient(supabase, ownerId);
    if (message.startsWith("Generated")) {
      generatedCount += 1;
    } else if (message.startsWith("No new charges generated")) {
      unchangedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return `Owners processed: ${ownerIds.length}. Generated: ${generatedCount}. Unchanged: ${unchangedCount}. Skipped: ${skippedCount}.`;
}
