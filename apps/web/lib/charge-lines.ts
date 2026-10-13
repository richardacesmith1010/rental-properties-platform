import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { chargeBreakdown, splitChargePayment, type ChargeAmount, type ChargeLine } from "@/lib/charge-breakdown";
export { chargeBreakdown, splitChargePayment } from "@/lib/charge-breakdown";
export type { ChargeLine, ChargeAmount, ChargeParts } from "@/lib/charge-breakdown";

export async function getChargeLines(chargeIds: string[]): Promise<ChargeLine[]> {
  if (!chargeIds.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("rent_charge_lines")
    .select("id, lease_id, charge_id, kind, label, amount_cents, created_at")
    .in("charge_id", chargeIds);
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
  return (data ?? []) as ChargeLine[];
}

export async function getWaitingLines(leaseIds: string[]): Promise<ChargeLine[]> {
  if (!leaseIds.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.from("rent_charge_lines")
    .select("id, lease_id, charge_id, kind, label, amount_cents, created_at")
    .in("lease_id", leaseIds).is("charge_id", null);
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
  return (data ?? []) as ChargeLine[];
}

export function linesByCharge(lines: ChargeLine[]): Map<string, ChargeLine[]> {
  const map = new Map<string, ChargeLine[]>();
  for (const line of lines) {
    if (!line.charge_id) continue;
    map.set(line.charge_id, [...(map.get(line.charge_id) ?? []), line]);
  }
  return map;
}

export async function managerFeeBaseForCharge(charge: ChargeAmount): Promise<number> {
  const lines = await getChargeLines([charge.id]);
  if (!lines.length) return charge.amount_cents;
  return splitChargePayment(chargeBreakdown(charge, lines)).rentIncomeCents;
}

export async function createRentChargeWithLines(admin: ReturnType<typeof createAdminClient>,
  leaseId: string, dueDate: string, rentCents: number): Promise<boolean> {
  const { data, error } = await admin.rpc("create_rent_charge_with_lines", {
    p_lease_id: leaseId, p_due_date: dueDate, p_rent_cents: rentCents
  });
  if (error) throw error;
  return data?.[0]?.created === true;
}
