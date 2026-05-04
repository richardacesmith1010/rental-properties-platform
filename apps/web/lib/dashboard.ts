import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ChargeCategory,
  type ChargeEditHistoryEntryDTO,
  type ChargeStatus,
  getChargeAuditSummary,
  getChargeEditHistoryMap,
  normalizeChargeCategory,
  withChargeEditingFallback
} from "@/lib/charge-audit";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";

export interface DashboardKpis {
  monthlyGrossRentCents: number;
  activeLeaseCount: number;
  occupiedUnits: number;
  totalUnits: number;
  openMaintenanceCount: number;
  highPriorityMaintenanceCount: number;
  lateRentCents: number;
  lateAccountCount: number;
  collectedRentCents: number;
  pendingRentCents: number;
  overdueRentCents: number;
  collectionRate: number;
  outstandingCents: number;
  outstandingAccountCount: number;
  netCashFlowCents: number;
}

export interface DashboardCharge {
  id: string;
  leaseId: string;
  propertyId: string;
  tenantProfileId: string | null;
  dueDate: string;
  amountCents: number;
  status: ChargeStatus;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  tenantEmail?: string | null;
  category: ChargeCategory;
  notes?: string | null;
  reminderSentAt?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
}

interface RecentPayment {
  id: string;
  amountCents: number;
  paidAt: string;
  method: string;
  propertyName: string;
  unitNumber: string;
  chargeDueDate: string | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  charges: DashboardCharge[];
  recentPayments: RecentPayment[];
  profileRole: "owner" | "manager" | "tenant";
}

export function computeTrend(
  current: number,
  previous: number | null | undefined
): "up" | "down" | "flat" | null {
  if (previous == null) {
    return null;
  }
  if (current > previous) {
    return "up";
  }
  if (current < previous) {
    return "down";
  }
  return "flat";
}

function emptyData(role: DashboardData["profileRole"]): DashboardData {
  return {
    profileRole: role,
    kpis: {
      monthlyGrossRentCents: 0,
      activeLeaseCount: 0,
      occupiedUnits: 0,
      totalUnits: 0,
      openMaintenanceCount: 0,
      highPriorityMaintenanceCount: 0,
      lateRentCents: 0,
      lateAccountCount: 0,
      collectedRentCents: 0,
      pendingRentCents: 0,
      overdueRentCents: 0,
      collectionRate: 0,
      outstandingCents: 0,
      outstandingAccountCount: 0,
      netCashFlowCents: 0
    },
    charges: [],
    recentPayments: []
  };
}

export async function getDashboardData(
  userId: string,
  accountId?: string | null
): Promise<DashboardData> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  const role = (profile?.role ?? "tenant") as DashboardData["profileRole"];

  if (role === "tenant") {
    return emptyData(role);
  }

  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);
  if (propertyIds.length === 0) {
    return emptyData(role);
  }

  const [{ data: propertyRows }, { data: units }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name")
      .in("id", propertyIds),
    admin
      .from("units")
      .select("id, occupied, property_id, unit_number")
      .in("property_id", propertyIds)
  ]);

  const properties = propertyRows ?? [];
  const unitsRows = units ?? [];
  const unitIds = unitsRows.map((u) => u.id);
  const occupiedUnits = unitsRows.filter((u) => u.occupied).length;

  if (unitIds.length === 0) {
    return {
      ...emptyData(role),
      kpis: {
        ...emptyData(role).kpis,
        totalUnits: 0,
        occupiedUnits: 0
      }
    };
  }

  const { data: leaseRows } = await admin
    .from("leases")
    .select("id, monthly_rent_cents, active, unit_id, tenant_profile_id")
    .in("unit_id", unitIds);

  const leases = leaseRows ?? [];
  const activeLeases = leases.filter((lease) => lease.active);
  const leaseIds = leases.map((lease) => lease.id);

  const { data: maintenance } = await admin
    .from("maintenance_tickets")
    .select("id, priority")
    .in("property_id", propertyIds)
    .in("status", ["open", "in_progress"]);

  const propertyNameById = new Map(properties.map((property) => [property.id, property.name]));
  const unitById = new Map(unitsRows.map((unit) => [unit.id, unit]));
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));

  const tenantIds = Array.from(
    new Set(
      leases
        .map((lease) => lease.tenant_profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: tenantProfiles } = tenantIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", tenantIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

  const tenantNameById = new Map(
    (tenantProfiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "Unknown tenant"])
  );
  const tenantEmailById = new Map(
    (tenantProfiles ?? []).map((profile) => [profile.id, profile.email ?? null])
  );

  let charges: Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: ChargeStatus;
    category: ChargeCategory;
    notes?: string | null;
  }> = [];

  let lateCharges: Array<{ amount_cents: number; lease_id: string }> = [];

  let recentPayments: Array<{
    id: string;
    amount_cents: number;
    paid_at: string;
    method: string;
    rent_charge_id: string;
  }> = [];
  let reminderSentAtByChargeId = new Map<string, string>();
  let chargeHistoryById = new Map<string, ChargeEditHistoryEntryDTO[]>();

  if (leaseIds.length > 0) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const [lateChargeRows, pendingLateChargeRows, leaseChargeIdRows] = await Promise.all([
      withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("amount_cents, lease_id")
            .in("lease_id", leaseIds)
            .eq("status", "late")
            .is("deleted_at", null),
        () =>
          admin
            .from("rent_charges")
            .select("amount_cents, lease_id")
            .in("lease_id", leaseIds)
            .eq("status", "late")
      ),
      withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("id, lease_id, due_date, amount_cents, status, category, notes")
            .in("lease_id", leaseIds)
            .in("status", ["pending", "late", "waived"])
            .is("deleted_at", null)
            .order("due_date", { ascending: true })
            .limit(30),
        () =>
          admin
            .from("rent_charges")
            .select("id, lease_id, due_date, amount_cents, status, category")
            .in("lease_id", leaseIds)
            .in("status", ["pending", "late"])
            .order("due_date", { ascending: true })
            .limit(20)
      ),
      withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("id")
            .in("lease_id", leaseIds)
            .is("deleted_at", null),
        () => admin.from("rent_charges").select("id").in("lease_id", leaseIds)
      )
    ]);

    const chargeQueryError =
      lateChargeRows.error ?? pendingLateChargeRows.error ?? leaseChargeIdRows.error ?? null;
    if (chargeQueryError) {
      throw chargeQueryError;
    }

    const chargeIdsForLease = (leaseChargeIdRows.data ?? []).map((row) => row.id);

    const { data: recentPaymentRows } = chargeIdsForLease.length
      ? await admin
          .from("payments")
          .select("id, amount_cents, paid_at, method, rent_charge_id")
          .in("rent_charge_id", chargeIdsForLease)
          .gte("paid_at", thirtyDaysAgo.toISOString())
          .order("paid_at", { ascending: false })
          .limit(10)
      : { data: [] as Array<{ id: string; amount_cents: number; paid_at: string; method: string; rent_charge_id: string }> };

    const paidChargeIds = (recentPaymentRows ?? []).map((payment) => payment.rent_charge_id);
    const pendingLateRows = (pendingLateChargeRows.data ?? []) as Array<{
      id: string;
      lease_id: string;
      due_date: string;
      amount_cents: number;
      status: ChargeStatus;
      category: string | null;
      notes?: string | null;
    }>;

    const uniqueChargeIds = Array.from(
      new Set([...pendingLateRows.map((row) => row.id), ...paidChargeIds])
    );

    const chargeDetailsResult = uniqueChargeIds.length
      ? await withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, due_date, amount_cents, status, category, notes")
              .in("id", uniqueChargeIds)
              .is("deleted_at", null),
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, due_date, amount_cents, status, category")
              .in("id", uniqueChargeIds)
        )
      : {
          data: [] as Array<{
            id: string;
            lease_id: string;
            due_date: string;
            amount_cents: number;
            status: ChargeStatus;
            category: string | null;
            notes?: string | null;
          }>,
          error: null
        };
    const chargeDetails = chargeDetailsResult.data ?? [];
    if (chargeDetailsResult.error) {
      throw chargeDetailsResult.error;
    }

    if (uniqueChargeIds.length > 0) {
      const { data: reminderNotifications, error: reminderError } = await admin
        .from("notifications")
        .select("entity_id, created_at")
        .in("entity_id", uniqueChargeIds)
        .in("entity_type", ["rent_charge", "charge"])
        .in("type", ["rent_due_reminder", "delinquency_escalation"])
        .order("created_at", { ascending: false });

      if (reminderError) {
        console.error("Unable to load rent reminder activity:", reminderError);
      } else {
        reminderSentAtByChargeId = new Map(
          (reminderNotifications ?? [])
            .filter(
              (notification): notification is { entity_id: string; created_at: string } =>
                Boolean(notification.entity_id && notification.created_at)
            )
            .filter((notification, index, rows) =>
              rows.findIndex((row) => row.entity_id === notification.entity_id) === index
            )
            .map((notification) => [notification.entity_id, notification.created_at])
        );
      }
    }

    chargeHistoryById = await getChargeEditHistoryMap(admin, uniqueChargeIds);
    const chargeById = new Map(chargeDetails.map((charge) => [charge.id, charge]));

    const pendingLateCharges = pendingLateRows.map((charge) => ({
      id: charge.id,
      lease_id: charge.lease_id,
      due_date: charge.due_date,
      amount_cents: charge.amount_cents,
      status: charge.status,
      category: normalizeChargeCategory(charge.category),
      notes: charge.notes ?? null
    }));

    const paidChargeRows = (recentPaymentRows ?? [])
      .map((payment) => chargeById.get(payment.rent_charge_id))
      .filter(
        (charge): charge is {
          id: string;
          lease_id: string;
          due_date: string;
          amount_cents: number;
          status: ChargeStatus;
          category: string | null;
          notes?: string | null;
        } => Boolean(charge)
      )
      .filter((charge) => charge.status === "paid")
      .map((charge) => ({
        id: charge.id,
        lease_id: charge.lease_id,
        due_date: charge.due_date,
        amount_cents: charge.amount_cents,
        status: charge.status,
        category: normalizeChargeCategory(charge.category),
        notes: charge.notes ?? null
      }));

    const seenChargeIds = new Set<string>();
    charges = [...pendingLateCharges, ...paidChargeRows].filter((charge) => {
      if (seenChargeIds.has(charge.id)) {
        return false;
      }
      seenChargeIds.add(charge.id);
      return true;
    });

    lateCharges = (lateChargeRows.data ?? []) as Array<{ amount_cents: number; lease_id: string }>;
    recentPayments = (recentPaymentRows ?? []) as Array<{
      id: string;
      amount_cents: number;
      paid_at: string;
      method: string;
      rent_charge_id: string;
    }>;
  }

  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const currentMonthCharges = charges.filter((charge) => {
    const dueDate = new Date(`${charge.due_date}T00:00:00.000Z`);
    return (
      !Number.isNaN(dueDate.getTime()) &&
      dueDate.getUTCMonth() === currentMonth &&
      dueDate.getUTCFullYear() === currentYear &&
      charge.category === "rent"
    );
  });
  const collectedRentCents = currentMonthCharges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + charge.amount_cents, 0);
  const pendingRentCents = currentMonthCharges
    .filter((charge) => charge.status === "pending")
    .reduce((sum, charge) => sum + charge.amount_cents, 0);
  const overdueRentCents = currentMonthCharges
    .filter((charge) => charge.status === "late")
    .reduce((sum, charge) => sum + charge.amount_cents, 0);
  const totalDueCents = collectedRentCents + pendingRentCents + overdueRentCents;
  const outstandingCharges = charges.filter(
    (charge) => charge.status === "pending" || charge.status === "late"
  );
  const outstandingCents = outstandingCharges.reduce((sum, charge) => sum + charge.amount_cents, 0);
  const outstandingAccountCount = new Set(outstandingCharges.map((charge) => charge.lease_id)).size;

  return {
    profileRole: role,
    kpis: {
      monthlyGrossRentCents: activeLeases.reduce(
        (sum, lease) => sum + lease.monthly_rent_cents,
        0
      ),
      activeLeaseCount: activeLeases.length,
      occupiedUnits,
      totalUnits: unitsRows.length,
      openMaintenanceCount: maintenance?.length ?? 0,
      highPriorityMaintenanceCount:
        maintenance?.filter((item) => item.priority === "high" || item.priority === "urgent")
          .length ?? 0,
      lateRentCents: lateCharges.reduce((sum, charge) => sum + charge.amount_cents, 0),
      lateAccountCount: new Set(lateCharges.map((charge) => charge.lease_id)).size,
      collectedRentCents,
      pendingRentCents,
      overdueRentCents,
      collectionRate: totalDueCents > 0 ? (collectedRentCents / totalDueCents) * 100 : 0,
      outstandingCents,
      outstandingAccountCount,
      netCashFlowCents: 0
    },
    charges: charges.map((charge) => {
      const lease = leaseById.get(charge.lease_id);
      const unit = lease ? unitById.get(lease.unit_id) : null;
      const propertyName = unit ? propertyNameById.get(unit.property_id) ?? "Unknown Property" : "Unknown Property";
      const unitNumber = unit?.unit_number ?? "-";
      const tenantName = lease?.tenant_profile_id
        ? tenantNameById.get(lease.tenant_profile_id) ?? "Unknown tenant"
        : "No tenant";

      return {
        id: charge.id,
        leaseId: charge.lease_id,
        propertyId: unit?.property_id ?? "",
        tenantProfileId: lease?.tenant_profile_id ?? null,
        dueDate: charge.due_date,
        amountCents: charge.amount_cents,
        status: charge.status,
        propertyName,
        unitNumber,
        tenantName,
        tenantEmail: lease?.tenant_profile_id
          ? tenantEmailById.get(lease.tenant_profile_id) ?? null
          : null,
        category: charge.category,
        notes: charge.notes ?? null,
        reminderSentAt: reminderSentAtByChargeId.get(charge.id) ?? null,
        ...getChargeAuditSummary(chargeHistoryById.get(charge.id) ?? [])
      };
    }),
    recentPayments: recentPayments.map((payment) => {
      const charge = charges.find((item) => item.id === payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const unit = lease ? unitById.get(lease.unit_id) : null;

      return {
        id: payment.id,
        amountCents: payment.amount_cents,
        paidAt: payment.paid_at,
        method: payment.method,
        propertyName: unit ? propertyNameById.get(unit.property_id) ?? "Unknown Property" : "Unknown Property",
        unitNumber: unit?.unit_number ?? "-",
        chargeDueDate: charge?.due_date ?? null
      };
    })
  };
}
