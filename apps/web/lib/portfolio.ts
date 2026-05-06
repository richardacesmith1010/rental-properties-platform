import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerFeesForProperties } from "@/lib/payment-fees";
import {
  getAdministeredProperties,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

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
  squareFeet: number | null;
  occupied: boolean;
  active: boolean;
}

export interface LeaseListItem {
  id: string;
  unitId: string;
  propertyId: string;
  propertyName?: string;
  tenantProfileId: string;
  unitLabel: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  monthlyRentCents: number;
  depositCents: number;
  dueDayOfMonth: number;
  startDate: string;
  endDate: string;
  leaseStatus: "active" | "expiring_soon" | "expired" | "terminated" | "renewed";
  gracePeriodDays: number;
  lateFeeCents: number;
  notes: string | null;
  active: boolean;
}

export interface TenantOption {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  propertyIds: string[];
}

export interface PortfolioData {
  properties: PropertyListItem[];
  units: UnitListItem[];
  leases: LeaseListItem[];
  tenants: TenantOption[];
}

interface TenantProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}

async function fetchTenantProfiles(admin: ReturnType<typeof createAdminClient>) {
  const result = await admin
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("role", "tenant")
    .order("email", { ascending: true })
    .limit(100);

  if (result.error && isMissingSchemaError(result.error)) {
    const fallback = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "tenant")
      .order("email", { ascending: true })
      .limit(100);

    return (fallback.data ?? []).map((row) => ({
      ...row,
      phone: null
    })) as TenantProfileRow[];
  }

  return ((result.data ?? []) as TenantProfileRow[]);
}

export async function getPortfolioData(
  userId: string,
  accountId?: string | null
): Promise<PortfolioData> {
  const admin = createAdminClient();

  const selfProfileResult = await admin
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("id", userId)
    .single();
  let selfProfile = selfProfileResult.data;
  if (selfProfileResult.error && isMissingSchemaError(selfProfileResult.error)) {
    const fallback = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();
    selfProfile = fallback.data
      ? {
          ...fallback.data,
          phone: null as string | null
        }
      : null;
  }

  function mergeTenantOptions(
    rows: TenantProfileRow[] | null,
    propertyIdsByTenantId: Map<string, string[]>,
    propertyIdsByEmail: Map<string, string[]>
  ) {
    const byId = new Map<string, { id: string; email: string; fullName: string; phone: string | null }>();
    for (const row of rows ?? []) {
      byId.set(row.id, {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone ?? null
      });
    }
    if (selfProfile?.id) {
      byId.set(selfProfile.id, {
        id: selfProfile.id,
        email: selfProfile.email,
        fullName: `${selfProfile.full_name} (you)`,
        phone: selfProfile.phone ?? null
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

  const scopedPropertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : null;
  const administeredProperties = (await getAdministeredProperties(userId)).filter((property) =>
    scopedPropertyIds ? scopedPropertyIds.includes(property.id) : true
  );
  const propertyIds = administeredProperties.map((property) => property.id);

  if (propertyIds.length === 0) {
    const tenants = await fetchTenantProfiles(admin);

    return {
      properties: [],
      units: [],
      leases: [],
      tenants: mergeTenantOptions(tenants, new Map(), new Map())
    };
  }

  const [
    { data: properties, error: propertiesError },
    { data: units, error: unitsError },
    tenants,
    { data: tenantInvitations },
    managerFeesByPropertyId
  ] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code, owner_account_id, active")
      .in("id", propertyIds)
      .order("created_at", { ascending: true }),
    admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, square_feet, occupied, active")
      .in("property_id", propertyIds)
      .order("unit_number", { ascending: true }),
    fetchTenantProfiles(admin),
    admin
      .from("invitations")
      .select("email, property_id, role, status")
      .eq("role", "tenant")
      .in("property_id", propertyIds)
      .in("status", ["pending", "accepted"]),
    getManagerFeesForProperties(propertyIds.map((propertyId) => ({ propertyId })))
  ]);

  let propertyRows: Array<{
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    owner_account_id: string | null;
    active: boolean;
  }> = [];

  if (propertiesError && isMissingSchemaError(propertiesError)) {
    const [{ data: ownerAwareRows, error: ownerAwareError }, { data: legacyRows }] = await Promise.all([
      admin
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code, owner_account_id")
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
          active: true
        }))
      : (ownerAwareRows ?? []).map((property) => ({
          ...property,
          owner_account_id: property.owner_account_id as string | null,
          active: true
        }));
  } else {
    propertyRows = (properties ?? []).map((property) => ({
      ...property,
      owner_account_id: property.owner_account_id as string | null,
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
    square_feet: number | null;
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
      square_feet: null,
      active: true
    }));
  } else {
    unitRows = (units ?? []).map((unit) => ({
      ...unit,
      square_feet: unit.square_feet ?? null,
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
    notes: string | null;
    active: boolean;
  }> = [];

  if (unitIds.length > 0) {
    const leaseResult = await admin
      .from("leases")
      .select(
        "id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month, start_date, end_date, lease_status, grace_period_days, late_fee_cents, notes, active"
      )
      .in("unit_id", unitIds)
      .order("start_date", { ascending: false });

    if (leaseResult.error && isMissingSchemaError(leaseResult.error)) {
      const fallback = await admin
        .from("leases")
        .select(
          "id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month, start_date, end_date, lease_status, grace_period_days, late_fee_cents, active"
        )
        .in("unit_id", unitIds)
        .order("start_date", { ascending: false });

      leases = (fallback.data ?? []).map((lease) => ({
        ...lease,
        notes: null
      }));
    } else {
      leases = (leaseResult.data ?? []).map((lease) => ({
        ...lease,
        notes: lease.notes ?? null
      }));
    }
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
    managementFeeCents: managerFeesByPropertyId.get(property.id)?.feeCents ?? 0,
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
    squareFeet: unit.square_feet ?? null,
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
      propertyName: property?.name ?? "Property",
      tenantProfileId: lease.tenant_profile_id ?? "",
      unitLabel: property && unit ? `${property.name} • ${unit.unit_number}` : lease.unit_id,
      tenantName: tenant?.full_name ?? tenant?.email ?? "Unknown tenant",
      tenantEmail: tenant?.email ?? lease.tenant_profile_id,
      tenantPhone: tenant?.phone ?? null,
      monthlyRentCents: lease.monthly_rent_cents,
      depositCents: lease.deposit_cents,
      dueDayOfMonth: lease.due_day_of_month,
      startDate: lease.start_date,
      endDate: lease.end_date,
      leaseStatus: lease.lease_status ?? "active",
      gracePeriodDays: lease.grace_period_days ?? 5,
      lateFeeCents: lease.late_fee_cents ?? 0,
      notes: lease.notes ?? null,
      active: lease.active
    };
  });

  const propertyIdsByTenantId = new Map<string, string[]>();
  for (const lease of leaseList.filter((item) => item.active)) {
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
    tenants: mergeTenantOptions(tenants, propertyIdsByTenantId, propertyIdsByEmail)
  };
}
