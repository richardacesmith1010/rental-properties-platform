import { createClient } from "@/lib/supabase/server";
import { getAdminMaintenanceTickets, type MaintenanceTicket } from "@/lib/maintenance";
import { isCollectedOutsideDomus, type LeaseCollectionPreference } from "@/lib/lease-collection";

interface ManagerProperty {
  id: string;
  name: string;
  city: string;
  state: string;
  unitCount: number;
}

interface ManagerCharge {
  id: string;
  leaseId: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "paid" | "late";
}

export function getManagerChargeStatus(
  status: ManagerCharge["status"],
  lease: LeaseCollectionPreference | null | undefined
): ManagerCharge["status"] {
  return status === "late" && isCollectedOutsideDomus(lease) ? "pending" : status;
}

export function summarizeManagerLateCharges(
  charges: Array<{ amount_cents: number; lease_id: string }>,
  leaseById: ReadonlyMap<string, LeaseCollectionPreference>
) {
  const lateCharges = charges.filter(
    (charge) => !isCollectedOutsideDomus(leaseById.get(charge.lease_id))
  );
  return {
    lateRentCents: lateCharges.reduce((sum, charge) => sum + charge.amount_cents, 0),
    lateAccountCount: new Set(lateCharges.map((charge) => charge.lease_id)).size
  };
}

export interface ManagerDashboardData {
  kpis: {
    assignedPropertyCount: number;
    totalUnits: number;
    occupiedUnits: number;
    activeLeaseCount: number;
    openMaintenanceCount: number;
    highPriorityMaintenanceCount: number;
    lateRentCents: number;
    lateAccountCount: number;
  };
  properties: ManagerProperty[];
  tickets: MaintenanceTicket[];
  charges: ManagerCharge[];
}

function emptyData(): ManagerDashboardData {
  return {
    kpis: {
      assignedPropertyCount: 0,
      totalUnits: 0,
      occupiedUnits: 0,
      activeLeaseCount: 0,
      openMaintenanceCount: 0,
      highPriorityMaintenanceCount: 0,
      lateRentCents: 0,
      lateAccountCount: 0,
    },
    properties: [],
    tickets: [],
    charges: [],
  };
}

export async function getManagerDashboardData(
  userId: string
): Promise<ManagerDashboardData> {
  const supabase = createClient();

  // Get assigned properties via property_managers junction table
  const { data: assignments } = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  const propertyIds = (assignments ?? []).map((a) => a.property_id);

  if (propertyIds.length === 0) {
    return emptyData();
  }

  // Fetch properties
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, city, state")
    .in("id", propertyIds);

  // Fetch units
  const { data: units } = await supabase
    .from("units")
    .select("id, property_id, occupied, unit_number")
    .in("property_id", propertyIds);

  const unitIds = (units ?? []).map((u) => u.id);
  const occupiedUnits = (units ?? []).filter((u) => u.occupied).length;

  // Count units per property
  const unitCountByProperty = new Map<string, number>();
  for (const unit of units ?? []) {
    unitCountByProperty.set(
      unit.property_id,
      (unitCountByProperty.get(unit.property_id) ?? 0) + 1
    );
  }

  const managerProperties: ManagerProperty[] = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    state: p.state,
    unitCount: unitCountByProperty.get(p.id) ?? 0,
  }));

  // Fetch leases
  const { data: leases } = await supabase
    .from("leases")
    .select("id, active, collects_outside_domus")
    .in("unit_id", unitIds.length > 0 ? unitIds : ["__none__"]);

  const activeLeases = (leases ?? []).filter((l) => l.active);
  const leaseIds = (leases ?? []).map((l) => l.id);
  const leaseById = new Map((leases ?? []).map((lease) => [lease.id, lease]));

  // Fetch maintenance tickets
  const { data: maintenance } = await supabase
    .from("maintenance_tickets")
    .select("id, priority")
    .in("property_id", propertyIds)
    .in("status", ["open", "in_progress"]);

  const tickets: MaintenanceTicket[] = await getAdminMaintenanceTickets(userId);

  // Fetch charges
  let charges: ManagerCharge[] = [];
  let lateRentCents = 0;
  let lateAccountCount = 0;

  if (leaseIds.length > 0) {
    const { data: chargeRows } = await supabase
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"])
      .order("due_date", { ascending: true })
      .limit(8);

    charges = (chargeRows ?? []).map((c) => ({
      id: c.id,
      leaseId: c.lease_id,
      dueDate: c.due_date,
      amountCents: c.amount_cents,
      status: getManagerChargeStatus(
        c.status as ManagerCharge["status"],
        leaseById.get(c.lease_id)
      ),
    }));

    const { data: lateChargeRows } = await supabase
      .from("rent_charges")
      .select("amount_cents, lease_id")
      .in("lease_id", leaseIds)
      .eq("status", "late");

    ({ lateRentCents, lateAccountCount } = summarizeManagerLateCharges(
      lateChargeRows ?? [],
      leaseById
    ));
  }

  return {
    kpis: {
      assignedPropertyCount: propertyIds.length,
      totalUnits: units?.length ?? 0,
      occupiedUnits,
      activeLeaseCount: activeLeases.length,
      openMaintenanceCount: maintenance?.length ?? 0,
      highPriorityMaintenanceCount:
        maintenance?.filter(
          (m) => m.priority === "high" || m.priority === "urgent"
        ).length ?? 0,
      lateRentCents,
      lateAccountCount,
    },
    properties: managerProperties,
    tickets,
    charges,
  };
}
