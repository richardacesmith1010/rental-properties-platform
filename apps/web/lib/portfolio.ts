import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredProperties } from "@/lib/property-access";

export interface PropertyListItem {
  id: string;
  name: string;
  city: string;
  state: string;
  postalCode: string;
  unitCount: number;
  ownerAccountId: string | null;
  ownerAccountName: string;
}

export interface UnitListItem {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  monthlyRentCents: number;
  occupied: boolean;
}

export interface LeaseListItem {
  id: string;
  unitLabel: string;
  tenantEmail: string;
  monthlyRentCents: number;
  dueDayOfMonth: number;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface TenantOption {
  id: string;
  email: string;
  fullName: string;
}

export interface PortfolioData {
  properties: PropertyListItem[];
  units: UnitListItem[];
  leases: LeaseListItem[];
  tenants: TenantOption[];
}

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("column") && message.includes("does not exist")
  );
}

export async function getPortfolioData(userId: string): Promise<PortfolioData> {
  const admin = createAdminClient();

  const { data: selfProfile } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .single();

  function mergeTenantOptions(rows: Array<{ id: string; email: string; full_name: string }> | null) {
    const byId = new Map<string, { id: string; email: string; fullName: string }>();
    for (const row of rows ?? []) {
      byId.set(row.id, { id: row.id, email: row.email, fullName: row.full_name });
    }
    if (selfProfile?.id) {
      byId.set(selfProfile.id, {
        id: selfProfile.id,
        email: selfProfile.email,
        fullName: `${selfProfile.full_name} (you)`
      });
    }
    return Array.from(byId.values());
  }

  const administeredProperties = await getAdministeredProperties(userId);
  const propertyIds = administeredProperties.map((property) => property.id);

  if (propertyIds.length === 0) {
    const { data: tenants } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "tenant")
      .order("email", { ascending: true })
      .limit(100);

    return {
      properties: [],
      units: [],
      leases: [],
      tenants: mergeTenantOptions(tenants ?? null)
    };
  }

  const [{ data: properties, error: propertiesError }, { data: units }, { data: tenants }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, city, state, postal_code, owner_account_id")
      .in("id", propertyIds)
      .order("created_at", { ascending: true }),
    admin
      .from("units")
      .select("id, property_id, unit_number, monthly_rent_cents, occupied")
      .in("property_id", propertyIds)
      .order("unit_number", { ascending: true }),
    admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "tenant")
      .order("email", { ascending: true })
      .limit(100)
  ]);

  const legacyPropertiesQuery =
    propertiesError && isMissingSchemaError(propertiesError)
      ? await admin
          .from("properties")
          .select("id, name, city, state, postal_code")
          .in("id", propertyIds)
          .order("created_at", { ascending: true })
      : null;

  const propertyRows = propertiesError && legacyPropertiesQuery
    ? (legacyPropertiesQuery.data ?? []).map((property) => ({
        ...property,
        owner_account_id: null as string | null
      }))
    : (properties ?? []).map((property) => ({
        ...property,
        owner_account_id: property.owner_account_id as string | null
      }));
  const unitRows = units ?? [];
  const unitIds = unitRows.map((unit) => unit.id);

  const ownerAccountIds = Array.from(
    new Set(
      propertyRows
        .map((property) => property.owner_account_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: ownershipAccounts } = ownerAccountIds.length
    ? await admin
        .from("ownership_accounts")
        .select("id, display_name")
        .in("id", ownerAccountIds)
    : { data: [] as Array<{ id: string; display_name: string }> };

  const ownershipAccountNameById = new Map(
    (ownershipAccounts ?? []).map((account) => [account.id, account.display_name])
  );

  let leases: Array<{
    id: string;
    unit_id: string;
    tenant_profile_id: string;
    monthly_rent_cents: number;
    due_day_of_month: number;
    start_date: string;
    end_date: string;
    active: boolean;
  }> = [];

  if (unitIds.length > 0) {
    const { data: leaseRows } = await admin
      .from("leases")
      .select("id, unit_id, tenant_profile_id, monthly_rent_cents, due_day_of_month, start_date, end_date, active")
      .in("unit_id", unitIds)
      .order("start_date", { ascending: false });

    leases = leaseRows ?? [];
  }

  const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));

  const propertiesWithCounts: PropertyListItem[] = propertyRows.map((property) => ({
    id: property.id,
    name: property.name,
    city: property.city,
    state: property.state,
    postalCode: property.postal_code,
    unitCount: unitRows.filter((unit) => unit.property_id === property.id).length,
    ownerAccountId: property.owner_account_id,
    ownerAccountName:
      property.owner_account_id
        ? ownershipAccountNameById.get(property.owner_account_id) ?? "Ownership Account"
        : "Owner Account"
  }));

  const unitsWithProperty: UnitListItem[] = unitRows.map((unit) => ({
    id: unit.id,
    propertyId: unit.property_id,
    propertyName: propertyById.get(unit.property_id)?.name ?? "Unknown Property",
    unitNumber: unit.unit_number,
    monthlyRentCents: unit.monthly_rent_cents,
    occupied: unit.occupied
  }));

  const leaseList: LeaseListItem[] = leases.map((lease) => {
    const unit = unitById.get(lease.unit_id);
    const property = unit ? propertyById.get(unit.property_id) : undefined;
    const tenant = tenantById.get(lease.tenant_profile_id);

    return {
      id: lease.id,
      unitLabel: property && unit ? `${property.name} • Unit ${unit.unit_number}` : lease.unit_id,
      tenantEmail: tenant?.email ?? lease.tenant_profile_id,
      monthlyRentCents: lease.monthly_rent_cents,
      dueDayOfMonth: lease.due_day_of_month,
      startDate: lease.start_date,
      endDate: lease.end_date,
      active: lease.active
    };
  });

  return {
    properties: propertiesWithCounts,
    units: unitsWithProperty,
    leases: leaseList,
    tenants: mergeTenantOptions(tenants ?? null)
  };
}
