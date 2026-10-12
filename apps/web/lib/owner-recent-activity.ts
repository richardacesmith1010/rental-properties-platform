import { createAdminClient } from "@/lib/supabase/admin";
import { loadRentRowsForProperties } from "@/lib/owner-rent-rows";
import { dateOnly, rentReceivedByPropertyId } from "@/lib/rent-received";
import type { Entry } from "@/lib/home-money";

export interface OwnerMoneyItem extends Pick<Entry, "id" | "date" | "title" | "amountCents" | "direction"> {
  propertyId: string;
  propertyName: string;
}
export type OwnerHomeMoneyResult = { ok: true; leftByPropertyId: Record<string, number>; items: OwnerMoneyItem[] }
  | { ok: false; error: "load_failed" };

export async function loadOwnerHomeMoney(propertyIds: string[], today = new Date()): Promise<OwnerHomeMoneyResult> {
  if (!propertyIds.length) return { ok: true, leftByPropertyId: {}, items: [] };
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const currentFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  try {
    const admin = createAdminClient();
    const [rentRows, expenseResult, propertyResult] = await Promise.all([
      loadRentRowsForProperties(propertyIds, from, to),
      admin.from("property_expenses").select("id, property_id, category, description, amount_cents, expense_date")
        .in("property_id", propertyIds).gte("expense_date", from).lt("expense_date", to),
      admin.from("properties").select("id, name").in("id", propertyIds)
    ]);
    if (expenseResult.error) throw expenseResult.error;
    if (propertyResult.error) throw propertyResult.error;
    const propertyNames = Object.fromEntries((propertyResult.data ?? []).map((row) => [row.id, row.name]));
    const { units, leases, charges, payments } = rentRows;
    const unitProperty = new Map(units.map((row) => [row.id, row.property_id]));
    const leaseProperty = new Map(leases.map((row) => [row.id, unitProperty.get(row.unit_id)]));
    const chargeProperty = new Map(charges.map((row) => [row.id, leaseProperty.get(row.lease_id)]));
    const chargeLease = new Map(charges.map((row) => [row.id, row.lease_id]));
    const profileIds = [...new Set(leases.map((row) => row.tenant_profile_id).filter((id): id is string => Boolean(id)))];
    const profileResult = profileIds.length
      ? await admin.from("profiles").select("id, full_name, nickname").in("id", profileIds)
      : { data: [], error: null };
    if (profileResult.error) throw profileResult.error;
    const names = new Map((profileResult.data ?? []).map((row) => [row.id, row.full_name || row.nickname || "Tenant"]));
    const leaseTenant = new Map(leases.map((row) => [row.id, row.tenant_profile_id]));
    const inByProperty = rentReceivedByPropertyId(propertyIds, charges, payments, chargeProperty, currentFrom, to);
    const outByProperty: Record<string, number> = {};
    const items: OwnerMoneyItem[] = [];
    for (const payment of payments) {
      const propertyId = chargeProperty.get(payment.rent_charge_id);
      if (!propertyId) continue;
      const tenantId = leaseTenant.get(chargeLease.get(payment.rent_charge_id) ?? "");
      items.push({ id: payment.id, date: dateOnly(payment.paid_at), title: tenantId
        ? `Rent from ${names.get(tenantId) ?? "Tenant"}` : "Rent", amountCents: payment.amount_cents,
        direction: "in", propertyId, propertyName: propertyNames[propertyId] ?? "Home" });
    }
    for (const expense of expenseResult.data ?? []) {
      if (expense.expense_date >= currentFrom) {
        outByProperty[expense.property_id] = (outByProperty[expense.property_id] ?? 0) + expense.amount_cents;
      }
      items.push({ id: expense.id, date: dateOnly(expense.expense_date),
        title: expense.description?.split(" · ")[0]?.trim() || expense.category || "Bill",
        amountCents: expense.amount_cents, direction: "out", propertyId: expense.property_id,
        propertyName: propertyNames[expense.property_id] ?? "Home" });
    }
    items.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return { ok: true, leftByPropertyId: Object.fromEntries(propertyIds.map((id) =>
      [id, (inByProperty[id] ?? 0) - (outByProperty[id] ?? 0)])), items: items.slice(0, 5) };
  } catch (error) {
    console.error("Owner home money load failed", error);
    return { ok: false, error: "load_failed" };
  }
}
