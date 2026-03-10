import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredProperties } from "@/lib/property-access";

export interface PropertyListItem {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  managementFeeCents: number;
  unitCount: number;
  ownerAccountId: string | null;
  ownerAccountName: string;
  active: boolean;
}

export interface UnitListItem {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRentCents: number;
  occupied: boolean;
  active: boolean;
}

export interface LeaseListItem {
  id: string;
  unitId: string;
  propertyId: string;
  tenantProfileId: string;
  unitLabel: string;
  tenantEmail: string;
  monthlyRentCents: number;
  depositCents: number;
  dueDayOfMonth: number;
  startDate: string;
  endDate: string;
  leaseStatus: "active" | "expiring_soon" | "expired" | "terminated" | "renewed";
  gracePeriodDays: number;
  lateFeeCents: number;
  active: boolean;
}

export interface TenantOption {
  id: string;
  email: string;
  fullName: string;
  propertyIds: string[];
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

  function mergeTenantOptions(
    rows: Array<{ id: string; email: string; full_name: string }> | null,
    propertyIdsByTenantId: Map<string, string[]>,
    propertyIdsByEmail: Map<string, string[]>
  ) {
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
    return Array.from(byId.values()).map((tenant) => {
      const ids = new Set<string>([
        ...(propertyIdsByTenantId.get(tenant.id) ?? []),
        ...(propertyIdsByEmail.get(tenant.email.toLowerCase()) ?? [])
      ]);
      return {
        ...tenant,
        propertyIds: Array.from(ids)
      };
    });
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
      tenants: mergeTenantOptions(tenants ?? null, new Map(), new Map())
    };
  }

  const [{ data: properties, error: propertiesError }, { data: units, error: unitsError }, { data: tenants }, { data: tenantInvitations }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code, owner_account_id, management_fee_cents, active")
      .in("id", propertyIds)
      .order("created_at", { ascending: true }),
    admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, occupied, active")
      .in("property_id", propertyIds)
      .order("unit_number", { ascending: true }),
    admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "tenant")
      .order("email", { ascending: true })
      .limit(100),
    admin
      .from("invitations")
      .select("email, property_id, role, status")
      .eq("role", "tenant")
      .in("property_id", propertyIds)
      .in("status", ["pending", "accepted"])
  ]);

  let propertyRows: Array<{
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    owner_account_id: string | null;
    management_fee_cents: number | null;
    active: boolean;
  }> = [];

  if (propertiesError && isMissingSchemaError(propertiesError)) {
    const [{ data: ownerAwareRows, error: ownerAwareError }, { data: legacyRows }] = await Promise.all([
      admin
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code, owner_account_id, management_fee_cents")
        .in("id", propertyIds)
        .order("created_at", { ascending: true }),
      admin
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code")
        .in("id", propertyIds)
        .order("created_at", { ascending: true })
    ]);

    propertyRows = ownerAwareError && isMissingSchemaError(ownerAwareError)
      ? (legacyRows ?? []).map((property) => ({
          ...property,
          owner_account_id: null as string | null,
          management_fee_cents: 0,
          active: true
        }))
      : (ownerAwareRows ?? []).map((property) => ({
          ...property,
          owner_account_id: property.owner_account_id as string | null,
          management_fee_cents: property.management_fee_cents ?? 0,
          active: true
        }));
  } else {
    propertyRows = (properties ?? []).map((property) => ({
      ...property,
      owner_account_id: property.owner_account_id as string | null,
      management_fee_cents: property.management_fee_cents ?? 0,
      active: property.active ?? true
    }));
  }

  propertyRows = propertyRows.filter((property) => property.active);

  let unitRows: Array<{
    id: string;
    property_id: string;
    unit_number: string;
    bedrooms: number;
    bathrooms: number;
    monthly_rent_cents: number;
    occupied: boolean;
    active: boolean;
  }> = [];

  if (unitsError && isMissingSchemaError(unitsError)) {
    const { data: legacyUnits } = await admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, occupied")
      .in("property_id", propertyIds)
      .order("unit_number", { ascending: true });

    unitRows = (legacyUnits ?? []).map((unit) => ({
      ...unit,
      active: true
    }));
  } else {
    unitRows = (units ?? []).map((unit) => ({
      ...unit,
      active: unit.active ?? true
    }));
  }

  const activePropertyIds = new Set(propertyRows.map((property) => property.id));
  unitRows = unitRows.filter((unit) => unit.active && activePropertyIds.has(unit.property_id));
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
    deposit_cents: number;
    due_day_of_month: number;
    start_date: string;
    end_date: string;
    lease_status: "active" | "expiring_soon" | "expired" | "terminated" | "renewed" | null;
    grace_period_days: number | null;
    late_fee_cents: number | null;
    active: boolean;
  }> = [];

  if (unitIds.length > 0) {
    const { data: leaseRows } = await admin
      .from("leases")
      .select(
        "id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month, start_date, end_date, lease_status, grace_period_days, late_fee_cents, active"
      )
      .in("unit_id", unitIds)
      .order("start_date", { ascending: false });

    leases = (leaseRows ?? []).filter((lease) => lease.active);
  }

  const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));

  const propertiesWithCounts: PropertyListItem[] = propertyRows.map((property) => ({
    id: property.id,
    name: property.name,
    addressLine1: property.address_line1,
    city: property.city,
    state: property.state,
    postalCode: property.postal_code,
    managementFeeCents: property.management_fee_cents ?? 0,
    unitCount: unitRows.filter((unit) => unit.property_id === property.id).length,
    ownerAccountId: property.owner_account_id,
    ownerAccountName:
      property.owner_account_id
        ? ownershipAccountNameById.get(property.owner_account_id) ?? "Ownership Account"
        : "Owner Account",
    active: property.active
  }));

  const unitsWithProperty: UnitListItem[] = unitRows.map((unit) => ({
    id: unit.id,
    propertyId: unit.property_id,
    propertyName: propertyById.get(unit.property_id)?.name ?? "Unknown Property",
    unitNumber: unit.unit_number,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    monthlyRentCents: unit.monthly_rent_cents,
    occupied: unit.occupied,
    active: unit.active
  }));

  const leaseList: LeaseListItem[] = leases.map((lease) => {
    const unit = unitById.get(lease.unit_id);
    const property = unit ? propertyById.get(unit.property_id) : undefined;
    const tenant = tenantById.get(lease.tenant_profile_id);

    return {
      id: lease.id,
      unitId: lease.unit_id,
      propertyId: unit?.property_id ?? "",
      tenantProfileId: lease.tenant_profile_id,
      unitLabel: property && unit ? `${property.name} • Unit ${unit.unit_number}` : lease.unit_id,
      tenantEmail: tenant?.email ?? lease.tenant_profile_id,
      monthlyRentCents: lease.monthly_rent_cents,
      depositCents: lease.deposit_cents,
      dueDayOfMonth: lease.due_day_of_month,
      startDate: lease.start_date,
      endDate: lease.end_date,
      leaseStatus: lease.lease_status ?? "active",
      gracePeriodDays: lease.grace_period_days ?? 5,
      lateFeeCents: lease.late_fee_cents ?? 0,
      active: lease.active
    };
  });

  const propertyIdsByTenantId = new Map<string, string[]>();
  for (const lease of leaseList) {
    if (!lease.propertyId) continue;
    const existing = propertyIdsByTenantId.get(lease.tenantProfileId) ?? [];
    if (!existing.includes(lease.propertyId)) {
      existing.push(lease.propertyId);
      propertyIdsByTenantId.set(lease.tenantProfileId, existing);
    }
  }

  const propertyIdsByEmail = new Map<string, string[]>();
  for (const invitation of tenantInvitations ?? []) {
    if (!invitation.property_id || !invitation.email) continue;
    const normalizedEmail = invitation.email.toLowerCase();
    const existing = propertyIdsByEmail.get(normalizedEmail) ?? [];
    if (!existing.includes(invitation.property_id)) {
      existing.push(invitation.property_id);
      propertyIdsByEmail.set(normalizedEmail, existing);
    }
  }

  return {
    properties: propertiesWithCounts,
    units: unitsWithProperty,
    leases: leaseList,
    tenants: mergeTenantOptions(tenants ?? null, propertyIdsByTenantId, propertyIdsByEmail)
  };
}
