import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerFeesForProperties } from "@/lib/payment-fees";
import {
  getAdministeredProperties,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { assemblePortfolioPayload, filterAllowedTenantProfiles, type TenantProfileRow, type PortfolioPayload } from "@/lib/portfolio-rpc";

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

export async function getPortfolioDataLegacy(
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

  const resolvedPropertyIds = await resolvedPropertyIdsPromise;
  if (resolvedPropertyIds.length === 0) {
    selfProfile = await selfProfilePromise;

    return assemblePortfolioPayload({
      properties: [], units: [], leases: [], invitations: [], ownership_accounts: [],
      tenant_profiles: [], self_profile: selfProfile
    }, new Map());
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
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, square_feet, occupied, active")
      .in("property_id", resolvedPropertyIds)
      .order("unit_number", { ascending: true })
      .order("id", { ascending: true }),
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
  return assemblePortfolioPayload({
    properties: propertyRows,
    units: unitRows,
    leases,
    invitations: tenantInvitations ?? [],
    ownership_accounts: ownershipAccounts ?? [],
    tenant_profiles: tenants,
    self_profile: selfProfile
  }, managerFeesByPropertyId);
}

export async function getPortfolioData(
  userId: string,
  accountId?: string | null,
  administeredPropertyIds?: string[]
): Promise<PortfolioData> {
  const propertyIds = administeredPropertyIds ?? (accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : (await getAdministeredProperties(userId)).map((property) => property.id));
  const admin = createAdminClient();
  const rpcName = "owner_portfolio_payload";
  try {
    const [rpcResult, fees] = await Promise.all([
      admin.rpc(rpcName, { p_user_id: userId, p_property_ids: propertyIds }),
      getManagerFeesForProperties(propertyIds.map((propertyId) => ({ propertyId })))
    ]);
    if (!rpcResult.error && rpcResult.data) {
      return assemblePortfolioPayload(rpcResult.data as unknown as PortfolioPayload, fees);
    }
    const error = rpcResult.error;
    const code = /^[A-Z0-9]{5,10}$/.test(error?.code ?? "") ? error!.code : "UNKNOWN";
    const missing = isMissingSchemaError(error) || code === "PGRST202" || code === "42883";
    console.error(missing ? "owner_rpc_fallback_missing" : "owner_rpc_fallback_error", rpcName, code);
  } catch (error) {
    const rawCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const code = /^[A-Z0-9]{5,10}$/.test(rawCode) ? rawCode : "UNKNOWN";
    console.error("owner_rpc_fallback_error", rpcName, code);
  }
  return getPortfolioDataLegacy(userId, accountId, propertyIds);
}
