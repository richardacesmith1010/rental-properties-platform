import { createClient } from "@/lib/supabase/server";

export interface TenantLeaseDetails {
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  monthlyRentCents: number;
  depositCents: number;
  dueDayOfMonth: number;
  lateFeeCents: number;
  gracePeriodDays: number;
  leaseStatus: string;
  daysRemaining: number;
}

function getDaysRemaining(endDate: string) {
  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const endStart = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.ceil((endStart - todayStart) / (1000 * 60 * 60 * 24)));
}

export async function getTenantLeaseDetails(userId: string): Promise<TenantLeaseDetails[]> {
  const supabase = createClient();
  const { data: leases } = await supabase
    .from("leases")
    .select(
      "id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, late_fee_cents, grace_period_days, lease_status, active"
    )
    .eq("tenant_profile_id", userId)
    .eq("active", true)
    .order("start_date", { ascending: false });

  const leaseRows =
    (leases ?? []) as Array<{
      id: string;
      unit_id: string;
      start_date: string;
      end_date: string;
      monthly_rent_cents: number;
      deposit_cents: number;
      due_day_of_month: number;
      late_fee_cents: number | null;
      grace_period_days: number | null;
      lease_status: string | null;
      active: boolean;
    }>;

  if (leaseRows.length === 0) {
    return [];
  }

  const unitIds = Array.from(new Set(leaseRows.map((lease) => lease.unit_id)));
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, property_id")
    .in("id", unitIds);

  const unitRows =
    (units ?? []) as Array<{
      id: string;
      unit_number: string;
      property_id: string;
    }>;
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);

  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));

  return leaseRows.map((lease) => {
    const unit = unitById.get(lease.unit_id);
    const property = unit ? propertyById.get(unit.property_id) : null;

    return {
      leaseId: lease.id,
      propertyId: unit?.property_id ?? "",
      propertyName: property?.name ?? "Your Rental",
      unitNumber: unit?.unit_number ?? "?",
      startDate: lease.start_date,
      endDate: lease.end_date,
      monthlyRentCents: lease.monthly_rent_cents,
      depositCents: lease.deposit_cents,
      dueDayOfMonth: lease.due_day_of_month,
      lateFeeCents: lease.late_fee_cents ?? 0,
      gracePeriodDays: lease.grace_period_days ?? 5,
      leaseStatus: lease.lease_status ?? "active",
      daysRemaining: getDaysRemaining(lease.end_date)
    };
  });
}
