import { assembleOwnerDashboardPayload, type OwnerDashboardPayload } from "@/lib/dashboard-rpc";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardDataLegacy } from "@/lib/dashboard-legacy";
export { getDashboardDataLegacy } from "@/lib/dashboard-legacy";
import { type ChargeCategory, type ChargeStatus } from "@/lib/charge-audit";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { isCollectedOutsideDomus, type LeaseCollectionPreference } from "@/lib/lease-collection";

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
  tenantReportedPaidAt?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
  collectsOutsideDomus?: boolean;
}

export function getDashboardChargeStatus(
  status: ChargeStatus,
  lease: LeaseCollectionPreference | null | undefined
): ChargeStatus {
  return status === "late" && isCollectedOutsideDomus(lease) ? "pending" : status;
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

export function emptyData(role: DashboardData["profileRole"]): DashboardData {
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
  accountId?: string | null,
  administeredPropertyIds?: string[],
  authenticatedRole?: DashboardData["profileRole"]
): Promise<DashboardData> {
  const admin = createAdminClient();
  const profile = authenticatedRole
    ? { data: { role: authenticatedRole }, error: null }
    : await admin.from("profiles").select("id, role").eq("id", userId).single();
  if (profile.error) throw profile.error;
  const role = (profile.data?.role ?? "tenant") as DashboardData["profileRole"];
  if (role === "tenant") return emptyData("tenant");
  const propertyIds = administeredPropertyIds ?? (accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId));
  if (!propertyIds.length) return emptyData((role ?? "tenant") as DashboardData["profileRole"]);
  try {
    const { data, error } = await admin.rpc("owner_dashboard_payload", {
      p_property_ids: propertyIds,
      p_today: new Date().toISOString().slice(0, 10)
    });
    if (error || !data) {
      const code = /^[A-Z0-9]{5,10}$/.test(error?.code ?? "") ? error!.code : "UNKNOWN";
      const missing = isMissingSchemaError(error) || code === "PGRST202" || code === "42883";
      console.error(missing ? "owner_rpc_fallback_missing" : "owner_rpc_fallback_error", code);
    } else {
      return assembleOwnerDashboardPayload(data as unknown as OwnerDashboardPayload, role as DashboardData["profileRole"]);
    }
  } catch (error) {
    const rawCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const code = /^[A-Z0-9]{5,10}$/.test(rawCode) ? rawCode : "UNKNOWN";
    console.error("owner_rpc_fallback_error", code);
  }
  return getDashboardDataLegacy(userId, accountId, propertyIds, role as DashboardData["profileRole"]);
}
