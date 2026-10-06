import { createClient } from "@/lib/supabase/server";
import { withChargeEditingFallback } from "@/lib/charge-audit";

export interface PaymentHistoryItem {
  chargeId: string;
  paymentId: string;
  paidAt: string;
  amountCents: number;
  method: string;
  category: string;
  dueDate: string;
  propertyName: string;
  unitNumber: string;
  referenceNote: string | null;
}

export async function getTenantPaymentHistory(userId: string): Promise<PaymentHistoryItem[]> {
  const supabase = createClient();
  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("id, unit_id")
    .eq("tenant_profile_id", userId);
  if (leaseError) throw leaseError;

  const leaseRows = (leases ?? []) as Array<{ id: string; unit_id: string }>;
  if (leaseRows.length === 0) {
    return [];
  }

  const leaseIds = Array.from(new Set(leaseRows.map((lease) => lease.id)));
  const unitIds = Array.from(new Set(leaseRows.map((lease) => lease.unit_id)));
  const [chargeResult, unitResult] = await Promise.all([withChargeEditingFallback(
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .in("lease_id", leaseIds)
        .is("deleted_at", null),
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .in("lease_id", leaseIds)
  ), supabase.from("units").select("id, unit_number, property_id").in("id", unitIds)]);
  if (chargeResult.error) throw chargeResult.error;
  if (unitResult.error) throw unitResult.error;
  const charges = chargeResult.data;

  const chargeRows =
    (charges ?? []) as Array<{
      id: string;
      lease_id: string;
      due_date: string;
      amount_cents: number;
      category: string | null;
    }>;
  if (chargeRows.length === 0) {
    return [];
  }

  const chargeIds = Array.from(new Set(chargeRows.map((charge) => charge.id)));
  const unitRows = (unitResult.data ?? []) as Array<{
    id: string;
    unit_number: string;
    property_id: string;
  }>;
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));
  const [paymentResult, propertyResult] = await Promise.all([
    supabase.from("payments")
      .select("id, rent_charge_id, paid_at, amount_cents, method, reference_note")
      .in("rent_charge_id", chargeIds)
      .order("paid_at", { ascending: false })
      .limit(50),
    supabase.from("properties").select("id, name").in("id", propertyIds)
  ]);
  if (paymentResult.error) throw paymentResult.error;
  if (propertyResult.error) throw propertyResult.error;
  const payments = paymentResult.data;

  const paymentRows =
    (payments ?? []) as Array<{
      id: string;
      rent_charge_id: string;
      paid_at: string;
      amount_cents: number;
      method: string;
      reference_note: string | null;
    }>;
  if (paymentRows.length === 0) {
    return [];
  }

  const properties = propertyResult.data;

  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const chargeById = new Map(chargeRows.map((charge) => [charge.id, charge]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));

  return paymentRows
    .map((payment) => {
      const charge = chargeById.get(payment.rent_charge_id);
      if (!charge) {
        return null;
      }
      const lease = leaseById.get(charge.lease_id);
      const unit = lease ? unitById.get(lease.unit_id) : null;
      const property = unit ? propertyById.get(unit.property_id) : null;

      return {
        chargeId: charge.id,
        paymentId: payment.id,
        paidAt: payment.paid_at,
        amountCents: payment.amount_cents,
        method: payment.method,
        category: charge.category ?? "rent",
        dueDate: charge.due_date,
        propertyName: property?.name ?? "Your Rental",
        unitNumber: unit?.unit_number ?? "?",
        referenceNote: payment.reference_note
      };
    })
    .filter((payment): payment is PaymentHistoryItem => payment !== null);
}
