import {
  getChargeAuditSummary, normalizeChargeCategory, type ChargeCategory,
  type ChargeEditHistoryEntryDTO, type ChargeStatus
} from "@/lib/charge-audit";
import { getDashboardChargeStatus, type DashboardData } from "@/lib/dashboard";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";

interface Row { id: string }
interface Property extends Row { name: string }
interface Unit extends Row { occupied: boolean; property_id: string; unit_number: string }
interface Lease extends Row {
  monthly_rent_cents: number; active: boolean; unit_id: string;
  tenant_profile_id: string | null; collects_outside_domus: boolean;
}
interface Charge extends Row {
  lease_id: string; due_date: string; amount_cents: number; status: ChargeStatus;
  category: ChargeCategory | null; notes: string | null;
}
interface Payment extends Row {
  amount_cents: number; paid_at: string; method: string; rent_charge_id: string;
}
interface Profile extends Row { full_name: string | null; email: string | null }
interface History extends Row {
  charge_id: string; edited_by: string; field_name: string; old_value: string | null;
  new_value: string | null; reason: string | null; created_at: string;
}
export interface OwnerDashboardPayload {
  aggregates: {
    monthly_gross_rent_cents: number;
    active_lease_count: number;
    occupied_units: number;
    total_units: number;
    open_maintenance_count: number;
    high_priority_maintenance_count: number;
    late_rent_cents: number;
    late_account_count: number;
  };
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  maintenance: Array<Row & { priority: string }>;
  late_charges: Array<{ id: string; lease_id: string; amount_cents: number }>;
  charges: Charge[];
  recent_payments: Payment[];
  tenant_profiles: Profile[];
  reminders: Array<Row & { entity_id: string | null; created_at: string | null }>;
  charge_history: History[];
  editor_profiles: Profile[];
}

export function assembleOwnerDashboardPayload(
  payload: OwnerDashboardPayload,
  role: DashboardData["profileRole"],
  today = new Date()
): DashboardData {
  const properties = payload.properties ?? [];
  const units = payload.units ?? [];
  const leases = payload.leases ?? [];
  const rawCharges = payload.charges ?? [];
  const payments = payload.recent_payments ?? [];
  const propertyNameById = new Map(properties.map(row => [row.id, row.name]));
  const unitById = new Map(units.map(row => [row.id, row]));
  const leaseById = new Map(leases.map(row => [row.id, row]));
  const tenantById = new Map((payload.tenant_profiles ?? []).map(row => [row.id, row]));
  const editorById = new Map((payload.editor_profiles ?? []).map(row => [row.id, row]));
  const reminderByChargeId = new Map<string, string>();
  for (const row of payload.reminders ?? []) {
    if (row.entity_id && row.created_at && !reminderByChargeId.has(row.entity_id)) {
      reminderByChargeId.set(row.entity_id, row.created_at);
    }
  }
  const historyByChargeId = new Map<string, ChargeEditHistoryEntryDTO[]>();
  for (const row of payload.charge_history ?? []) {
    const editor = editorById.get(row.edited_by);
    const entry: ChargeEditHistoryEntryDTO = {
      id: row.id, chargeId: row.charge_id, editedBy: row.edited_by,
      editedByName: editor?.full_name || editor?.email || "Unknown user",
      fieldName: row.field_name, oldValue: row.old_value, newValue: row.new_value,
      reason: row.reason, createdAt: row.created_at
    };
    const entries = historyByChargeId.get(row.charge_id) ?? [];
    entries.push(entry);
    historyByChargeId.set(row.charge_id, entries);
  }
  const charges = rawCharges.map(row => ({ ...row, category: normalizeChargeCategory(row.category) }));
  const monthCharges = charges.filter(row => {
    const due = new Date(`${row.due_date}T00:00:00.000Z`);
    return !Number.isNaN(due.getTime()) && due.getUTCMonth() === today.getUTCMonth()
      && due.getUTCFullYear() === today.getUTCFullYear() && row.category === "rent";
  });
  const collected = monthCharges.filter(row => row.status === "paid")
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const pending = monthCharges.filter(row =>
    getDashboardChargeStatus(row.status, leaseById.get(row.lease_id)) === "pending"
  ).reduce((sum, row) => sum + row.amount_cents, 0);
  const overdue = monthCharges.filter(row =>
    getDashboardChargeStatus(row.status, leaseById.get(row.lease_id)) === "late"
  ).reduce((sum, row) => sum + row.amount_cents, 0);
  const outstanding = charges.filter(row => row.status === "pending" || row.status === "late");
  return {
    profileRole: role,
    kpis: {
      monthlyGrossRentCents: payload.aggregates.monthly_gross_rent_cents,
      activeLeaseCount: payload.aggregates.active_lease_count,
      occupiedUnits: payload.aggregates.occupied_units,
      totalUnits: payload.aggregates.total_units,
      openMaintenanceCount: payload.aggregates.open_maintenance_count,
      highPriorityMaintenanceCount: payload.aggregates.high_priority_maintenance_count,
      lateRentCents: payload.aggregates.late_rent_cents,
      lateAccountCount: payload.aggregates.late_account_count,
      collectedRentCents: collected,
      pendingRentCents: pending,
      overdueRentCents: overdue,
      collectionRate: collected + pending + overdue > 0
        ? collected / (collected + pending + overdue) * 100 : 0,
      outstandingCents: outstanding.reduce((sum, row) => sum + row.amount_cents, 0),
      outstandingAccountCount: new Set(outstanding.map(row => row.lease_id)).size,
      netCashFlowCents: 0
    },
    charges: charges.map(row => {
      const lease = leaseById.get(row.lease_id);
      const unit = lease ? unitById.get(lease.unit_id) : null;
      const tenant = lease?.tenant_profile_id ? tenantById.get(lease.tenant_profile_id) : null;
      return {
        id: row.id, leaseId: row.lease_id, propertyId: unit?.property_id ?? "",
        tenantProfileId: lease?.tenant_profile_id ?? null, dueDate: row.due_date,
        amountCents: row.amount_cents, status: getDashboardChargeStatus(row.status, lease),
        propertyName: unit ? propertyNameById.get(unit.property_id) ?? "Unknown Property" : "Unknown Property",
        unitNumber: unit?.unit_number ?? "-",
        tenantName: lease?.tenant_profile_id ? tenant?.full_name || tenant?.email || "Unknown tenant" : "No tenant",
        tenantEmail: lease?.tenant_profile_id ? tenant?.email ?? null : null,
        category: row.category, notes: row.notes ?? null,
        reminderSentAt: reminderByChargeId.get(row.id) ?? null,
        ...getChargeAuditSummary(historyByChargeId.get(row.id) ?? []),
        collectsOutsideDomus: isCollectedOutsideDomus(lease)
      };
    }),
    recentPayments: payments.map(payment => {
      const charge = charges.find(row => row.id === payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const unit = lease ? unitById.get(lease.unit_id) : null;
      return {
        id: payment.id, amountCents: payment.amount_cents, paidAt: payment.paid_at,
        method: payment.method,
        propertyName: unit ? propertyNameById.get(unit.property_id) ?? "Unknown Property" : "Unknown Property",
        unitNumber: unit?.unit_number ?? "-", chargeDueDate: charge?.due_date ?? null
      };
    })
  };
}
