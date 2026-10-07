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
  collectsOutsideDomus?: boolean;
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

function filterAllowedTenantProfiles(
  rows: TenantProfileRow[],
  leaseTenantIds: string[],
  invitedEmails: string[]
): TenantProfileRow[] {
  const allowedIds = new Set(leaseTenantIds);
  const allowedEmails = new Set(invitedEmails);
  return rows.filter((row) => allowedIds.has(row.id) || allowedEmails.has(row.email?.toLowerCase()));
}

async function fetchScopedTenantProfiles(
  admin: ReturnType<typeof createAdminClient>,
  leaseTenantIds: string[],
  invitedEmails: string[]
): Promise<TenantProfileRow[]> {
  const [idResult, emailResult] = await Promise.all([
    leaseTenantIds.length
      ? admin.from("profiles").select("id, email, full_name, phone").in("id", leaseTenantIds)
      : Promise.resolve({ data: [] as TenantProfileRow[], error: null }),
    invitedEmails.length
      ? admin.from("profiles").select("id, email, full_name, phone").in("email", invitedEmails)
      : Promise.resolve({ data: [] as TenantProfileRow[], error: null })
  ]);
  const [byId, byEmail] = await Promise.all([
    (async () => {
      if (!idResult.error) return idResult.data ?? [];
      if (!isMissingSchemaError(idResult.error)) {
        console.error("portfolio_tenant_profiles_error", idResult.error.code ?? "unknown");
        return [];
      }
      const retry = await admin.from("profiles").select("id, email, full_name").in("id", leaseTenantIds);
      if (retry.error) console.error("portfolio_tenant_profiles_error", retry.error.code ?? "unknown");
      return retry.error ? [] : (retry.data ?? []).map((row) => ({ ...row, phone: null }));
    })(),
    (async () => {
      if (!emailResult.error) return emailResult.data ?? [];
      if (!isMissingSchemaError(emailResult.error)) {
        console.error("portfolio_tenant_profiles_error", emailResult.error.code ?? "unknown");
        return [];
      }
      const retry = await admin.from("profiles").select("id, email, full_name").in("email", invitedEmails);
      if (retry.error) console.error("portfolio_tenant_profiles_error", retry.error.code ?? "unknown");
      return retry.error ? [] : (retry.data ?? []).map((row) => ({ ...row, phone: null }));
    })()
  ]);
  return filterAllowedTenantProfiles([...new Map([...byId, ...byEmail].map((row) => [row.id, row])).values()],
    leaseTenantIds, invitedEmails);
}

export async function getPortfolioData(
  userId: string,
  accountId?: string | null,
  administeredPropertyIds?: string[]
): Promise<PortfolioData> {
  const admin = createAdminClient();
  const selfProfilePromise = (async () => {
    const selfProfileResult = await admin
      .from("profiles")
      .select("id, email, full_name, phone")
      .eq("id", userId)
      .single();
    if (!selfProfileResult.error || !isMissingSchemaError(selfProfileResult.error)) {
      return selfProfileResult.data;
    }

    const fallback = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();
    return fallback.data
      ? {
          ...fallback.data,
          phone: null as string | null
        }
      : null;
  })();
  const resolvedPropertyIdsPromise = administeredPropertyIds
    ? Promise.resolve(administeredPropertyIds)
    : (async () => {
        const [scopedPropertyIds, administeredProperties] = await Promise.all([
          accountId
            ? getAdministeredPropertyIdsForAccount(userId, accountId)
            : Promise.resolve(null),
          getAdministeredProperties(userId)
        ]);
        return administeredProperties
          .filter((property) => scopedPropertyIds ? scopedPropertyIds.includes(property.id) : true)
          .map((property) => property.id);
      })();
  let selfProfile: Awaited<typeof selfProfilePromise> = null;

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

  const resolvedPropertyIds = await resolvedPropertyIdsPromise;
  if (resolvedPropertyIds.length === 0) {
    selfProfile = await selfProfilePromise;

    return {
      properties: [],
      units: [],
      leases: [],
      tenants: mergeTenantOptions([], new Map(), new Map())
    };
  }

  const [
    { data: properties, error: propertiesError },
    { data: units, error: unitsError },
    { data: tenantInvitations, error: tenantInvitationsError },
    managerFeesByPropertyId,
    loadedSelfProfile
  ] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code, owner_account_id, active")
      .in("id", resolvedPropertyIds)
      .order("created_at", { ascending: true }),
    admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, square_feet, occupied, active")
      .in("property_id", resolvedPropertyIds)
      .order("unit_number", { ascending: true }),
    admin
      .from("invitations")
      .select("email, property_id, role, status")
      .eq("role", "tenant")
      .in("property_id", resolvedPropertyIds)
      .in("status", ["pending", "accepted"]),
    getManagerFeesForProperties(resolvedPropertyIds.map((propertyId) => ({ propertyId }))),
    selfProfilePromise
  ]);
  selfProfile = loadedSelfProfile;
  if (tenantInvitationsError) {
    console.error("portfolio_tenant_invitations_error", tenantInvitationsError.code ?? "unknown");
  }

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
        .in("id", resolvedPropertyIds)
        .order("created_at", { ascending: true }),
      admin
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code")
        .in("id", resolvedPropertyIds)
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
      .in("property_id", resolvedPropertyIds)
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

  const ownershipAccountsPromise = ownerAccountIds.length
    ? admin
        .from("ownership_accounts")
        .select("id, display_name")
        .in("id", ownerAccountIds)
    : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> });

  type LeaseRow = {
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
    collects_outside_domus: boolean;
    notes: string | null;
    active: boolean;
  };
  const leasesPromise: Promise<LeaseRow[]> = unitIds.length > 0
    ? (async () => {
        const leaseResult = await admin
          .from("leases")
          .select(
            `id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month,
            start_date, end_date, lease_status, grace_period_days, late_fee_cents,
            collects_outside_domus, notes, active`
          )
          .in("unit_id", unitIds)
          .order("start_date", { ascending: false });

        if (leaseResult.error && isMissingSchemaError(leaseResult.error)) {
          const fallback = await admin
            .from("leases")
            .select(
              `id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month,
              start_date, end_date, lease_status, grace_period_days, late_fee_cents,
              collects_outside_domus, active`
            )
            .in("unit_id", unitIds)
            .order("start_date", { ascending: false });

          return (fallback.data ?? []).map((lease) => ({
            ...lease,
            notes: null
          }));
        }

        return (leaseResult.data ?? []).map((lease) => ({
          ...lease,
          notes: lease.notes ?? null
        }));
      })()
    : Promise.resolve([]);
  const [{ data: ownershipAccounts }, leases] = await Promise.all([
    ownershipAccountsPromise,
    leasesPromise
  ]);
  const leaseTenantIds = Array.from(new Set(leases.map((lease) => lease.tenant_profile_id).filter(Boolean)));
  const invitedEmails = Array.from(new Set((tenantInvitations ?? [])
    .map((invitation) => invitation.email?.toLowerCase()).filter((email): email is string => Boolean(email))));
  const tenants = await fetchScopedTenantProfiles(admin, leaseTenantIds, invitedEmails);
  const ownershipAccountNameById = new Map(
    (ownershipAccounts ?? []).map((account) => [account.id, account.display_name])
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
