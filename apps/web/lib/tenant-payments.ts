import { createClient } from "@/lib/supabase/server";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { formatUnitLabel } from "@/lib/format";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";

export interface TenantCharge {
  id: string;
  leaseId: string;
  propertyId: string;
  propertyLabel: string;
  propertyName: string;
  unitNumber: string;
  dueDate: string;
  amountCents: number;
  status: "pending" | "late";
  tenantReportedPaidAt?: string | null;
  collectsOutsideDomus?: boolean;
}

export interface TenantPaymentData {
  charges: TenantCharge[];
}

export function getTenantChargeStatus(
  status: "pending" | "late",
  lease: { collects_outside_domus?: boolean | null } | null | undefined
): "pending" | "late" {
  return status === "late" && isCollectedOutsideDomus(lease) ? "pending" : status;
}

export async function getTenantPaymentData(userId: string): Promise<TenantPaymentData> {
  const supabase = createClient();

  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("id, unit_id, collects_outside_domus")
    .eq("tenant_profile_id", userId)
    .eq("active", true);
  if (leaseError) throw leaseError;

  const leaseRows = leases ?? [];
  const leaseIds = leaseRows.map((lease) => lease.id);

  if (leaseIds.length === 0) {
    return { charges: [] };
  }

  const unitIds = leaseRows.map((lease) => lease.unit_id);

  const [unitsResult, chargesResult] = await Promise.all([
    supabase.from("units").select("id, unit_number, property_id").in("id", unitIds),
    withChargeEditingFallback(
      () => supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, tenant_reported_paid_at")
        .in("lease_id", leaseIds)
        .in("status", ["pending", "late"])
        .is("deleted_at", null)
        .order("due_date", { ascending: true }),
      () => supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, tenant_reported_paid_at")
        .in("lease_id", leaseIds)
        .in("status", ["pending", "late"])
        .order("due_date", { ascending: true })
    )
  ]);
  if (unitsResult.error) throw unitsResult.error;
  if (chargesResult.error) throw chargesResult.error;
  const units = unitsResult.data;
  const charges = chargesResult.data;

  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);
  if (propertyError) throw propertyError;

  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));

  return {
    charges: (charges ?? []).map((charge) => {
      const lease = leaseById.get(charge.lease_id);
      const unit = lease ? unitById.get(lease.unit_id) : undefined;
      const property = unit ? propertyById.get(unit.property_id) : undefined;

      const propertyLabel = property ? `${property.name} • ${formatUnitLabel(unit?.unit_number ?? "?")}` : "Your Rental";

      return {
        id: charge.id,
        leaseId: charge.lease_id,
        propertyId: unit?.property_id ?? "",
        propertyLabel,
        propertyName: property?.name ?? "Your Rental",
        unitNumber: unit?.unit_number ?? "?",
        dueDate: charge.due_date,
        amountCents: charge.amount_cents,
        status: getTenantChargeStatus(charge.status as "pending" | "late", lease),
        tenantReportedPaidAt: charge.tenant_reported_paid_at ?? null,
        collectsOutsideDomus: isCollectedOutsideDomus(lease)
      };
    })
  };
}
