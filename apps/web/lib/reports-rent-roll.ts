import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ChargeDetailRecordDTO,
  type ChargeEditHistoryEntryDTO,
  type ChargeStatus,
  getChargeAuditSummary,
  getChargeEditHistoryMap,
  withChargeEditingFallback
} from "@/lib/charge-audit";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface RentRollItem {
  leaseId: string;
  propertyId: string;
  tenantProfileId: string | null;
  propertyName: string;
  unitNumber: string;
  tenantName: string | null;
  tenantEmail: string | null;
  monthlyRentCents: number;
  leaseStart: string;
  leaseEnd: string;
  leaseStatus: string;
  currentBalance: number;
  lastPaymentDate: string | null;
  chargeDetails: ChargeDetailRecordDTO[];
}

export interface ScopedPropertyContext {
  propertyIds: string[];
  propertyById: Map<
    string,
    {
      id: string;
      name: string;
      addressLine1: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
    }
  >;
  unitById: Map<string, { id: string; propertyId: string; unitNumber: string }>;
}

export function buildMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, index) =>
    `${year}-${String(index + 1).padStart(2, "0")}`
  );
}

export function monthKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function startOfYear(year: number) {
  return `${year}-01-01`;
}

export function endOfYear(year: number) {
  return `${year}-12-31`;
}

export function differenceInDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export async function getScopedPropertyContext(
  userId: string
): Promise<ScopedPropertyContext> {
  const admin = createAdminClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  const [{ data: properties, error: propertiesError }, { data: units, error: unitsError }] =
    await Promise.all([
      admin
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code")
        .in("id", propertyIds),
      admin.from("units").select("id, property_id, unit_number").in("property_id", propertyIds)
    ]);

  if (propertiesError && isMissingSchemaError(propertiesError)) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  if (unitsError && isMissingSchemaError(unitsError)) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  if (propertiesError) {
    throw propertiesError;
  }

  if (unitsError) {
    throw unitsError;
  }

  return {
    propertyIds,
    propertyById: new Map(
      (properties ?? []).map((property) => [
        property.id,
        {
          id: property.id,
          name: property.name,
          addressLine1: property.address_line1,
          city: property.city,
          state: property.state,
          postalCode: property.postal_code
        }
      ])
    ),
    unitById: new Map(
      (units ?? []).map((unit) => [
        unit.id,
        {
          id: unit.id,
          propertyId: unit.property_id,
          unitNumber: unit.unit_number
        }
      ])
    )
  };
}

export async function getLeasesForScope(userId: string) {
  const admin = createAdminClient();
  const context = await getScopedPropertyContext(userId);
  const unitIds = Array.from(context.unitById.keys());

  if (unitIds.length === 0) {
    return {
      context,
      leases: [],
      tenantById: new Map<string, { name: string | null; email: string | null }>()
    };
  }

  const { data: leases, error } = await admin
    .from("leases")
    .select(
      "id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, lease_status, active"
    )
    .in("unit_id", unitIds);

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        context,
        leases: [],
        tenantById: new Map<string, { name: string | null; email: string | null }>()
      };
    }
    throw error;
  }

  const tenantIds = Array.from(
    new Set(
      (leases ?? [])
        .map((lease) => lease.tenant_profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", tenantIds)
    : { data: [], error: null };

  if (profilesError) {
    if (isMissingSchemaError(profilesError)) {
      return {
        context,
        leases: leases ?? [],
        tenantById: new Map<string, { name: string | null; email: string | null }>()
      };
    }
    throw profilesError;
  }

  return {
    context,
    leases: leases ?? [],
    tenantById: new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          name: profile.full_name,
          email: profile.email
        }
      ])
    )
  };
}

export function composePropertyAddress(property: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  return [property.addressLine1, property.city, property.state, property.postalCode]
    .filter(Boolean)
    .join(", ");
}

export async function getChargeDetailsForLeases(params: {
  admin: ReturnType<typeof createAdminClient>;
  context: ScopedPropertyContext;
  leases: Array<{
    id: string;
    unit_id: string;
    tenant_profile_id: string | null;
  }>;
  tenantById: Map<string, { name: string | null; email: string | null }>;
  statuses?: ChargeStatus[];
}) {
  const { admin, context, leases, tenantById, statuses } = params;
  const leaseIds = leases.map((lease) => lease.id);

  if (leaseIds.length === 0) {
    return {
      chargeIds: [] as string[],
      detailsByLeaseId: new Map<string, ChargeDetailRecordDTO[]>()
    };
  }

  const primary = () => {
    let query = admin
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status, category, notes")
      .in("lease_id", leaseIds)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    if (statuses?.length) {
      query = query.in("status", statuses);
    }
    return query;
  };
  const fallback = () => {
    let query = admin
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status, category")
      .in("lease_id", leaseIds)
      .order("due_date", { ascending: true });
    if (statuses?.length) {
      query = query.in("status", statuses.filter((status) => status !== "waived"));
    }
    return query;
  };

  const { data: charges, error } = await withChargeEditingFallback(primary, fallback);
  if (error) {
    throw error;
  }

  const chargeRows = (charges ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: ChargeStatus;
    category: string | null;
    notes?: string | null;
  }>;
  const chargeIds = chargeRows.map((charge) => charge.id);
  const historyByChargeId = await getChargeEditHistoryMap(admin, chargeIds);
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const detailsByLeaseId = new Map<string, ChargeDetailRecordDTO[]>();

  for (const charge of chargeRows) {
    const lease = leaseById.get(charge.lease_id);
    if (!lease) {
      continue;
    }
    const unit = context.unitById.get(lease.unit_id);
    const property = unit ? context.propertyById.get(unit.propertyId) : null;
    const tenant = lease.tenant_profile_id ? tenantById.get(lease.tenant_profile_id) : null;
    const history = historyByChargeId.get(charge.id) ?? ([] as ChargeEditHistoryEntryDTO[]);
    const audit = getChargeAuditSummary(history);
    const list = detailsByLeaseId.get(charge.lease_id) ?? [];
    list.push({
      id: charge.id,
      leaseId: charge.lease_id,
      propertyId: unit?.propertyId ?? "",
      propertyName: property?.name ?? "Unknown Property",
      unitNumber: unit?.unitNumber ?? "-",
      tenantProfileId: lease.tenant_profile_id,
      tenantName: tenant?.name ?? tenant?.email ?? "Unknown tenant",
      tenantEmail: tenant?.email ?? "",
      dueDate: charge.due_date,
      amountCents: charge.amount_cents,
      status: charge.status,
      category: (charge.category ?? "rent") as ChargeDetailRecordDTO["category"],
      notes: charge.notes ?? null,
      latestEditedAt: audit.latestEditedAt,
      latestEditedByName: audit.latestEditedByName,
      editedCount: audit.editedCount
    });
    detailsByLeaseId.set(charge.lease_id, list);
  }

  return { chargeIds, detailsByLeaseId };
}

export async function getRentRollReport(userId: string): Promise<RentRollItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const activeLeases = leases.filter(
      (lease) => lease.active === true || (lease.lease_status ?? "active") === "active"
    );

    if (activeLeases.length === 0) {
      return [];
    }

    const { detailsByLeaseId } = await getChargeDetailsForLeases({
      admin,
      context,
      leases: activeLeases,
      tenantById,
      statuses: ["pending", "late", "waived", "paid"]
    });
    const leaseIdByChargeId = new Map<string, string>();
    for (const [leaseId, details] of detailsByLeaseId.entries()) {
      for (const detail of details) {
        leaseIdByChargeId.set(detail.id, leaseId);
      }
    }
    const { data: payments } = leaseIdByChargeId.size
      ? await admin
          .from("payments")
          .select("rent_charge_id, paid_at")
          .in("rent_charge_id", Array.from(leaseIdByChargeId.keys()))
      : { data: [] };

    const balanceByLeaseId = new Map<string, number>();
    for (const [leaseId, details] of detailsByLeaseId.entries()) {
      balanceByLeaseId.set(
        leaseId,
        details
          .filter((detail) => detail.status === "pending" || detail.status === "late")
          .reduce((sum, detail) => sum + detail.amountCents, 0)
      );
    }

    const latestPaymentByLeaseId = new Map<string, string>();
    for (const payment of payments ?? []) {
      const leaseId = leaseIdByChargeId.get(payment.rent_charge_id);
      if (!leaseId) {
        continue;
      }
      const current = latestPaymentByLeaseId.get(leaseId);
      if (!current || payment.paid_at > current) {
        latestPaymentByLeaseId.set(leaseId, payment.paid_at);
      }
    }

    return activeLeases.map((lease) => {
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = lease.tenant_profile_id ? tenantById.get(lease.tenant_profile_id) : null;

      return {
        leaseId: lease.id,
        propertyId: unit?.propertyId ?? "",
        tenantProfileId: lease.tenant_profile_id ?? null,
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-",
        tenantName: tenant?.name ?? null,
        tenantEmail: tenant?.email ?? null,
        monthlyRentCents: lease.monthly_rent_cents,
        leaseStart: lease.start_date,
        leaseEnd: lease.end_date,
        leaseStatus: lease.lease_status ?? (lease.active ? "active" : "inactive"),
        currentBalance: balanceByLeaseId.get(lease.id) ?? 0,
        lastPaymentDate: latestPaymentByLeaseId.get(lease.id) ?? null,
        chargeDetails: detailsByLeaseId.get(lease.id) ?? []
      };
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}
