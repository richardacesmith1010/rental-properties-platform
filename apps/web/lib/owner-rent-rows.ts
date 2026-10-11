import { createAdminClient } from "@/lib/supabase/admin";
import { receivedRentPayments } from "@/lib/rent-received";

type Row = { id: string };
type Query<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
  order?: (column: string) => Query<T>;
  range?: (from: number, to: number) => Query<T>;
};
interface Unit extends Row { property_id: string }
interface Lease extends Row {
  unit_id: string; tenant_profile_id: string | null; grace_period_days: number | null; active: boolean;
}
interface Charge extends Row {
  lease_id: string; category: string; amount_cents: number; due_date: string;
  status: string; deleted_at: string | null;
}
interface Payment extends Row {
  rent_charge_id: string; amount_cents: number; paid_at: string; reversed_at: string | null;
  method: string | null; stripe_payment_intent_id: string | null;
}

const PAGE_SIZE = 1000;
const IN_SIZE = 200;

async function allPages<T extends Row>(makeQuery: () => Query<T>): Promise<T[]> {
  const rows = new Map<string, T>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = makeQuery();
    const ordered = query.order ? query.order("id") : query;
    const paged = ordered.range ? ordered.range(offset, offset + PAGE_SIZE - 1) : ordered;
    const { data, error } = await paged;
    if (error || !data) throw new Error("Rent data unavailable.");
    for (const row of data) rows.set(row.id, row);
    if (data.length < PAGE_SIZE) break;
  }
  return [...rows.values()];
}

async function inBatches<T extends Row>(ids: string[], query: (batch: string[]) => Query<T>): Promise<T[]> {
  const uniqueIds = [...new Set(ids)];
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / IN_SIZE) }, (_, index) =>
    uniqueIds.slice(index * IN_SIZE, (index + 1) * IN_SIZE));
  const pages = await Promise.all(batches.map((batch) => allPages(() => query(batch))));
  return [...new Map(pages.flat().map((row) => [row.id, row])).values()];
}

export async function loadRentRowsForProperties(propertyIds: string[], from: string, to: string) {
  const admin = createAdminClient();
  const units = await inBatches<Unit>(propertyIds, (batch) => admin.from("units")
    .select("id, property_id").in("property_id", batch) as unknown as Query<Unit>);
  const leases = await inBatches<Lease>(units.map((row) => row.id), (batch) => admin.from("leases")
    .select("id, unit_id, tenant_profile_id, grace_period_days, active")
    .in("unit_id", batch) as unknown as Query<Lease>);
  const charges = await inBatches<Charge>(leases.map((row) => row.id), (batch) => admin.from("rent_charges")
    .select("id, lease_id, category, amount_cents, due_date, status, deleted_at")
    .in("lease_id", batch).is("deleted_at", null) as unknown as Query<Charge>);
  const payments = await inBatches<Payment>(charges.map((row) => row.id), (batch) => admin.from("payments")
    .select("id, rent_charge_id, amount_cents, paid_at, reversed_at, method, stripe_payment_intent_id")
    .in("rent_charge_id", batch).gte("paid_at", from).lt("paid_at", to) as unknown as Query<Payment>);
  return { units, leases, charges, payments: receivedRentPayments(charges, payments, from, to) };
}

export async function loadPropertyRentRows(propertyId: string, from: string, to: string) {
  return loadRentRowsForProperties([propertyId], from, to);
}

