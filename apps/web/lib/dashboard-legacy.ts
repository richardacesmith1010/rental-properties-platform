import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds, getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { getChargeAuditSummary, getChargeEditHistoryMap, normalizeChargeCategory,
  withChargeEditingFallback, type ChargeCategory, type ChargeEditHistoryEntryDTO,
  type ChargeStatus } from "@/lib/charge-audit";
import { isCollectedOutsideDomus, tracksLateRent } from "@/lib/lease-collection";
import { emptyData, getDashboardChargeStatus, type DashboardData } from "@/lib/dashboard";

export async function getDashboardDataLegacy(
  userId: string,
  accountId?: string | null,
  administeredPropertyIds?: string[],
  authenticatedRole?: DashboardData["profileRole"],
  clientFlags: ReadonlyMap<string, boolean> = new Map()
): Promise<DashboardData> {
  const admin = createAdminClient();
  const profilePromise = authenticatedRole
    ? Promise.resolve({ data: { role: authenticatedRole }, error: null })
    : admin.from("profiles").select("id, role").eq("id", userId).single();
  const propertyDataPromise = (async () => {
    const propertyIds = administeredPropertyIds ?? (accountId
      ? await getAdministeredPropertyIdsForAccount(userId, accountId)
      : await getAdministeredPropertyIds(userId));
    if (propertyIds.length === 0) {
      return { propertyIds, propertyRows: [], units: [] };
    }

    const [propertyResult, unitResult] = await Promise.all([
      admin
        .from("properties")
        .select("id, name")
        .in("id", propertyIds),
      admin
        .from("units")
        .select("id, occupied, property_id, unit_number")
        .in("property_id", propertyIds)
    ]);
    if (propertyResult.error) throw propertyResult.error;
    if (unitResult.error) throw unitResult.error;
    return { propertyIds, propertyRows: propertyResult.data ?? [], units: unitResult.data ?? [] };
  })();

  const { data: profile, error: profileError } = await profilePromise;
  if (profileError) throw profileError;

  const role = (profile?.role ?? "tenant") as DashboardData["profileRole"];

  if (role === "tenant") {
    void propertyDataPromise.catch(() => undefined);
    return emptyData(role);
  }

  const { propertyIds, propertyRows, units } = await propertyDataPromise;
  if (propertyIds.length === 0) {
    return emptyData(role);
  }

  const properties = propertyRows;
  const unitsRows = units;
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

  const [leaseResult, maintenanceResult] = await Promise.all([
    admin
      .from("leases")
      .select("id, monthly_rent_cents, active, unit_id, tenant_profile_id, collects_outside_domus")
      .in("unit_id", unitIds),
    admin
      .from("maintenance_tickets")
      .select("id, priority")
      .in("property_id", propertyIds)
      .in("status", ["open", "in_progress"])
  ]);
  if (leaseResult.error) throw leaseResult.error;
  if (maintenanceResult.error) throw maintenanceResult.error;
  const leases = leaseResult.data ?? [];
  const maintenance = maintenanceResult.data ?? [];
  const activeLeases = leases.filter((lease) => lease.active);
  const leaseIds = leases.map((lease) => lease.id);

  const propertyNameById = new Map(properties.map((property) => [property.id, property.name]));
  const unitById = new Map(unitsRows.map((unit) => [unit.id, unit]));
  const leaseById = new Map(leases.map((lease) => {
    const propertyId = unitById.get(lease.unit_id)?.property_id;
    return [lease.id, {
      ...lease, clientHome: propertyId ? clientFlags.get(propertyId) === true : false
    }] as const;
  }));
  const lateEligibleLeaseIds = leases
    .filter((lease) => tracksLateRent(leaseById.get(lease.id)))
    .map((lease) => lease.id);

  const tenantIds = Array.from(
    new Set(
      leases
        .map((lease) => lease.tenant_profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const tenantProfilesPromise = tenantIds.length
    ? admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", tenantIds)
    : Promise.resolve({
        data: [] as Array<{ id: string; full_name: string | null; email: string | null }>, error: null
      });

  let charges: Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: ChargeStatus;
    category: ChargeCategory;
    notes?: string | null;
    tenant_reported_paid_at?: string | null;
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

    const lateChargeRowsPromise = lateEligibleLeaseIds.length > 0
      ? withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("amount_cents, lease_id")
              .in("lease_id", lateEligibleLeaseIds)
              .eq("status", "late")
              .is("deleted_at", null),
          () =>
            admin
              .from("rent_charges")
              .select("amount_cents, lease_id")
              .in("lease_id", lateEligibleLeaseIds)
              .eq("status", "late")
        )
      : Promise.resolve({
          data: [] as Array<{ amount_cents: number; lease_id: string }>,
          error: null
        });

    const [lateChargeRows, pendingLateChargeRows, leaseChargeIdRows] = await Promise.all([
      lateChargeRowsPromise,
      withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("id, lease_id, due_date, amount_cents, status, category, notes, tenant_reported_paid_at")
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

    const { data: recentPaymentRows, error: recentPaymentError } = chargeIdsForLease.length
      ? await admin
          .from("payments")
          .select("id, amount_cents, paid_at, method, rent_charge_id")
          .in("rent_charge_id", chargeIdsForLease)
          .gte("paid_at", thirtyDaysAgo.toISOString())
          .order("paid_at", { ascending: false })
          .limit(10)
      : { data: [] as Array<{ id: string; amount_cents: number; paid_at: string; method: string; rent_charge_id: string }>, error: null };
    if (recentPaymentError) throw recentPaymentError;

    const paidChargeIds = (recentPaymentRows ?? []).map((payment) => payment.rent_charge_id);
    const pendingLateRows = (pendingLateChargeRows.data ?? []) as Array<{
      id: string;
      lease_id: string;
      due_date: string;
      amount_cents: number;
      status: ChargeStatus;
      category: string | null;
      notes?: string | null;
      tenant_reported_paid_at?: string | null;
    }>;

    const uniqueChargeIds = Array.from(
      new Set([...pendingLateRows.map((row) => row.id), ...paidChargeIds])
    );

    const chargeDetailsResult = uniqueChargeIds.length
      ? await withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, due_date, amount_cents, status, category, notes, tenant_reported_paid_at")
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
            tenant_reported_paid_at?: string | null;
          }>,
          error: null
        };
    const chargeDetails = chargeDetailsResult.data ?? [];
    if (chargeDetailsResult.error) {
      throw chargeDetailsResult.error;
    }

    const reminderNotificationsPromise = uniqueChargeIds.length > 0
      ? admin
          .from("notifications")
          .select("entity_id, created_at")
          .in("entity_id", uniqueChargeIds)
          .in("entity_type", ["rent_charge", "charge"])
          .in("type", ["rent_due_reminder", "delinquency_escalation"])
          .order("created_at", { ascending: false })
      : Promise.resolve({
          data: [] as Array<{ entity_id: string | null; created_at: string | null }>,
          error: null
        });
    const [reminderResult, loadedChargeHistoryById] = await Promise.all([
      reminderNotificationsPromise,
      getChargeEditHistoryMap(admin, uniqueChargeIds)
    ]);
    chargeHistoryById = loadedChargeHistoryById;

    if (uniqueChargeIds.length > 0) {
      const { data: reminderNotifications, error: reminderError } = reminderResult;
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

    const chargeById = new Map(chargeDetails.map((charge) => [charge.id, charge]));

    const pendingLateCharges = pendingLateRows.map((charge) => ({
      id: charge.id,
      lease_id: charge.lease_id,
      due_date: charge.due_date,
      amount_cents: charge.amount_cents,
      status: charge.status,
      category: normalizeChargeCategory(charge.category),
      notes: charge.notes ?? null,
      tenant_reported_paid_at: charge.tenant_reported_paid_at ?? null
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
          tenant_reported_paid_at?: string | null;
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
        notes: charge.notes ?? null,
        tenant_reported_paid_at: charge.tenant_reported_paid_at ?? null
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

  const { data: tenantProfiles, error: tenantProfilesError } = await tenantProfilesPromise;
  if (tenantProfilesError) throw tenantProfilesError;
  const tenantNameById = new Map(
    (tenantProfiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "Unknown tenant"])
  );
  const tenantEmailById = new Map(
    (tenantProfiles ?? []).map((profile) => [profile.id, profile.email ?? null])
  );

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
    .filter(
      (charge) =>
        getDashboardChargeStatus(charge.status, leaseById.get(charge.lease_id)) === "pending"
    )
    .reduce((sum, charge) => sum + charge.amount_cents, 0);
  const overdueRentCents = currentMonthCharges
    .filter(
      (charge) =>
        getDashboardChargeStatus(charge.status, leaseById.get(charge.lease_id)) === "late"
    )
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
        status: getDashboardChargeStatus(charge.status, lease),
        propertyName,
        unitNumber,
        tenantName,
        tenantEmail: lease?.tenant_profile_id
          ? tenantEmailById.get(lease.tenant_profile_id) ?? null
          : null,
        category: charge.category,
        notes: charge.notes ?? null,
        tenantReportedPaidAt: charge.tenant_reported_paid_at ?? null,
        reminderSentAt: reminderSentAtByChargeId.get(charge.id) ?? null,
        ...getChargeAuditSummary(chargeHistoryById.get(charge.id) ?? []),
        collectsOutsideDomus: isCollectedOutsideDomus(lease),
        ...(role === "manager" ? { clientHome: lease?.clientHome ?? false } : {})
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
