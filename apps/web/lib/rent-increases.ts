import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface RentIncreaseEntry {
  id: string;
  leaseId: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  previousRentCents: number;
  newRentCents: number;
  changePercent: number;
  effectiveDate: string;
  reason: string | null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export async function getRentIncreaseHistory(userId: string): Promise<RentIncreaseEntry[]> {
  const propertyIds = await getAdministeredPropertyIds(userId);
  if (propertyIds.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const [{ data: properties }, { data: units, error: unitsError }] = await Promise.all([
    admin.from("properties").select("id, name").in("id", propertyIds),
    admin.from("units").select("id, property_id, unit_number").in("property_id", propertyIds)
  ]);

  if (unitsError && isMissingSchemaError(unitsError)) {
    return [];
  }

  const safeUnits = units ?? [];
  const unitIds = safeUnits.map((unit) => unit.id);
  if (unitIds.length === 0) {
    return [];
  }

  const { data: leases, error: leasesError } = await admin
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .in("unit_id", unitIds);

  if (leasesError && isMissingSchemaError(leasesError)) {
    return [];
  }

  const safeLeases = leases ?? [];
  const leaseIds = safeLeases.map((lease) => lease.id);
  if (leaseIds.length === 0) {
    return [];
  }

  const { data: history, error: historyError } = await admin
    .from("rent_increase_history")
    .select("id, lease_id, previous_rent_cents, new_rent_cents, effective_date, reason")
    .in("lease_id", leaseIds)
    .order("effective_date", { ascending: false });

  if (historyError && isMissingSchemaError(historyError)) {
    return [];
  }

  const safeHistory = history ?? [];
  const tenantIds = unique(
    safeLeases.map((lease) => lease.tenant_profile_id).filter((tenantId): tenantId is string => Boolean(tenantId))
  );

  const { data: profiles } = tenantIds.length
    ? await admin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null; full_name: string | null }> };

  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
  const unitById = new Map(safeUnits.map((unit) => [unit.id, unit]));
  const leaseById = new Map(safeLeases.map((lease) => [lease.id, lease]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return safeHistory.flatMap((entry) => {
    const lease = leaseById.get(entry.lease_id);
    if (!lease) {
      return [];
    }

    const unit = unitById.get(lease.unit_id);
    if (!unit) {
      return [];
    }

    const property = propertyById.get(unit.property_id);
    if (!property) {
      return [];
    }

    const tenantProfile = lease.tenant_profile_id ? profileById.get(lease.tenant_profile_id) : null;
    const tenantName =
      tenantProfile?.full_name?.trim() ||
      tenantProfile?.email?.trim() ||
      "Unknown tenant";
    const previousRentCents = entry.previous_rent_cents ?? 0;
    const newRentCents = entry.new_rent_cents ?? 0;

    return [
      {
        id: entry.id,
        leaseId: entry.lease_id,
        tenantName,
        propertyName: property.name,
        unitNumber: unit.unit_number,
        previousRentCents,
        newRentCents,
        changePercent:
          previousRentCents > 0
            ? Number((((newRentCents - previousRentCents) / previousRentCents) * 100).toFixed(1))
            : 0,
        effectiveDate: entry.effective_date,
        reason: entry.reason
      }
    ];
  });
}
