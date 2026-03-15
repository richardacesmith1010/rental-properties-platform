import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface RentRollItem {
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

    const leaseIds = activeLeases.map((lease) => lease.id);
    const { data: charges } = await admin
      .from("rent_charges")
      .select("id, lease_id, amount_cents, status")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"]);

    const { data: chargeIds } = await admin
      .from("rent_charges")
      .select("id, lease_id")
      .in("lease_id", leaseIds);

    const leaseIdByChargeId = new Map((chargeIds ?? []).map((charge) => [charge.id, charge.lease_id]));
    const { data: payments } = leaseIdByChargeId.size
      ? await admin
          .from("payments")
          .select("rent_charge_id, paid_at")
          .in("rent_charge_id", Array.from(leaseIdByChargeId.keys()))
      : { data: [] };

    const balanceByLeaseId = new Map<string, number>();
    for (const charge of charges ?? []) {
      balanceByLeaseId.set(
        charge.lease_id,
        (balanceByLeaseId.get(charge.lease_id) ?? 0) + charge.amount_cents
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
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-",
        tenantName: tenant?.name ?? null,
        tenantEmail: tenant?.email ?? null,
        monthlyRentCents: lease.monthly_rent_cents,
        leaseStart: lease.start_date,
        leaseEnd: lease.end_date,
        leaseStatus: lease.lease_status ?? (lease.active ? "active" : "inactive"),
        currentBalance: balanceByLeaseId.get(lease.id) ?? 0,
        lastPaymentDate: latestPaymentByLeaseId.get(lease.id) ?? null
      };
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}
