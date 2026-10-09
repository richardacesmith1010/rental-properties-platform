import type { PortfolioData, PropertyListItem, UnitListItem, LeaseListItem } from "@/lib/portfolio";
import type { getManagerFeesForProperties } from "@/lib/payment-fees";

export interface TenantProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}
export interface PortfolioPayload {
  properties: Array<{
    id: string; name: string; address_line1: string; city: string; state: string;
    postal_code: string; owner_account_id: string | null; active: boolean | null;
  }>;
  units: Array<{
    id: string; property_id: string; unit_number: string; bedrooms: number; bathrooms: number;
    monthly_rent_cents: number; square_feet: number | null; occupied: boolean; active: boolean | null;
  }>;
  leases: Array<{
    id: string; unit_id: string; tenant_profile_id: string; monthly_rent_cents: number;
    deposit_cents: number; due_day_of_month: number; start_date: string; end_date: string;
    lease_status: LeaseListItem["leaseStatus"] | null; grace_period_days: number | null;
    late_fee_cents: number | null; collects_outside_domus: boolean; active: boolean;
    notes?: string | null;
  }>;
  invitations: Array<{ email: string; property_id: string }>;
  ownership_accounts: Array<{ id: string; display_name: string; managed_client?: boolean }>;
  tenant_profiles: TenantProfileRow[];
  self_profile: TenantProfileRow | null;
}

export function filterAllowedTenantProfiles(
  rows: TenantProfileRow[], leaseTenantIds: string[], invitedEmails: string[]
): TenantProfileRow[] {
  const allowedIds = new Set(leaseTenantIds);
  const allowedEmails = new Set(invitedEmails);
  return rows.filter((row) => allowedIds.has(row.id) || allowedEmails.has(row.email?.toLowerCase()));
}

export function assemblePortfolioPayload(
  payload: PortfolioPayload,
  managerFeesByPropertyId: Awaited<ReturnType<typeof getManagerFeesForProperties>>
): PortfolioData {
  const propertyRows = payload.properties.map((row) => ({ ...row, active: row.active ?? true }));
  const unitRows = payload.units.map((row) => ({ ...row, active: row.active ?? true }));
  const leases = payload.leases;
  const tenantInvitations = [...payload.invitations].sort((left, right) =>
    left.property_id.localeCompare(right.property_id)
      || left.email.toLowerCase().localeCompare(right.email.toLowerCase()));
  const ownershipAccounts = payload.ownership_accounts;
  const selfProfile = payload.self_profile;
  const leaseTenantIds = Array.from(new Set(leases.map((lease) => lease.tenant_profile_id).filter(Boolean)));
  const invitedEmails = Array.from(new Set(tenantInvitations
    .map((invitation) => invitation.email?.toLowerCase()).filter((email): email is string => Boolean(email))));
  const tenants = filterAllowedTenantProfiles(payload.tenant_profiles, leaseTenantIds, invitedEmails)
    .sort((left, right) => left.id.localeCompare(right.id));
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
    }).filter((tenant) => tenant.id === selfProfile?.id || tenant.propertyIds.length > 0);
  }

  const ownershipAccountNameById = new Map(
    (ownershipAccounts ?? []).map((account) => [account.id, account.display_name])
  );
  const ownershipAccountClientById = new Map(
    (ownershipAccounts ?? []).map((account) => [account.id, account.managed_client === true])
  );

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
    ownerAccountIsClient: property.owner_account_id
      ? ownershipAccountClientById.get(property.owner_account_id) ?? false : false,
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
      collectsOutsideDomus: lease.collects_outside_domus,
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
