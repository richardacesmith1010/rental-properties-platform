import { createClient } from "@/lib/supabase/server";

interface DashboardKpis {
  monthlyGrossRentCents: number;
  activeLeaseCount: number;
  occupiedUnits: number;
  totalUnits: number;
  openMaintenanceCount: number;
  highPriorityMaintenanceCount: number;
  lateRentCents: number;
  lateAccountCount: number;
}

interface DashboardCharge {
  id: string;
  leaseId: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late";
}

interface RecentPayment {
  id: string;
  amountCents: number;
  paidAt: string;
  method: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  charges: DashboardCharge[];
  recentPayments: RecentPayment[];
  profileRole: "owner" | "manager" | "tenant";
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
      lateAccountCount: 0
    },
    charges: [],
    recentPayments: []
  };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  const role = (profile?.role ?? "tenant") as DashboardData["profileRole"];

  const { data: properties } = await supabase
    .from("properties")
    .select("id")
    .eq("owner_profile_id", userId);

  const propertyIds = (properties ?? []).map((p) => p.id);

  if (propertyIds.length === 0) {
    return emptyData(role);
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, occupied")
    .in("property_id", propertyIds);

  const unitIds = (units ?? []).map((u) => u.id);
  const occupiedUnits = (units ?? []).filter((u) => u.occupied).length;

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

  const { data: leases } = await supabase
    .from("leases")
    .select("id, monthly_rent_cents, active")
    .in("unit_id", unitIds);

  const activeLeases = (leases ?? []).filter((l) => l.active);
  const leaseIds = (leases ?? []).map((l) => l.id);

  const { data: maintenance } = await supabase
    .from("maintenance_tickets")
    .select("id, priority")
    .in("property_id", propertyIds)
    .in("status", ["open", "in_progress"]);

  let charges: Array<{ id: string; lease_id: string; due_date: string; amount_cents: number; status: "pending" | "paid" | "late" }> = [];
  let lateCharges: Array<{ amount_cents: number; lease_id: string }> = [];
  let recentPayments: Array<{ id: string; amount_cents: number; paid_at: string; method: string }> = [];

  if (leaseIds.length > 0) {
    const { data: lateChargeRows } = await supabase
      .from("rent_charges")
      .select("amount_cents, lease_id")
      .in("lease_id", leaseIds)
      .eq("status", "late");

    const { data: chargeRows } = await supabase
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"])
      .order("due_date", { ascending: true })
      .limit(8);

    lateCharges = lateChargeRows ?? [];
    charges = chargeRows ?? [];

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("id, amount_cents, paid_at, method")
      .order("paid_at", { ascending: false })
      .limit(8);

    recentPayments = paymentRows ?? [];
  }

  return {
    profileRole: role,
    kpis: {
      monthlyGrossRentCents: activeLeases.reduce((sum, lease) => sum + lease.monthly_rent_cents, 0),
      activeLeaseCount: activeLeases.length,
      occupiedUnits,
      totalUnits: units?.length ?? 0,
      openMaintenanceCount: maintenance?.length ?? 0,
      highPriorityMaintenanceCount:
        maintenance?.filter((m) => m.priority === "high" || m.priority === "urgent").length ?? 0,
      lateRentCents: lateCharges.reduce((sum, charge) => sum + charge.amount_cents, 0),
      lateAccountCount: new Set(lateCharges.map((c) => c.lease_id)).size
    },
    charges: charges.map((charge) => ({
      id: charge.id,
      leaseId: charge.lease_id,
      dueDate: charge.due_date,
      amountCents: charge.amount_cents,
      status: charge.status
    })),
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amount_cents,
      paidAt: payment.paid_at,
      method: payment.method
    }))
  };
}
