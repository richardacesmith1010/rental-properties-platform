import { paymentMethodLabel } from "@/lib/payment-method-label";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;
const ID_CHUNK_SIZE = 200;
type Admin = ReturnType<typeof createAdminClient>;
type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

async function pages<T>(makeQuery: (from: number, to: number) => PromiseLike<QueryResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

async function chunks<T>(ids: string[], makeQuery: (ids: string[], from: number, to: number) => PromiseLike<QueryResult<T>>) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
    const group = ids.slice(index, index + ID_CHUNK_SIZE);
    rows.push(...await pages((from, to) => makeQuery(group, from, to)));
  }
  return rows;
}

const dollars = (cents: number) => Number((cents / 100).toFixed(2));
// JSON numbers do not preserve trailing zeroes: 1250.50 serializes as 1250.5.
const iso = (date: string | null) => date ? new Date(date).toISOString() : null;
const idsOf = <T,>(rows: T[], key: keyof T) => [...new Set(rows.map((row) => String(row[key])))];

export async function buildAccountExport(userId: string, role: "tenant" | "manager", generatedAt: string) {
  const db: Admin = createAdminClient();
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("full_name, email, phone, nickname, role, created_at").eq("id", userId).maybeSingle();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Profile missing");

  const messages = await pages((from, to) => db.from("inbox_messages")
    .select("id, thread_id, body, created_at").eq("sender_profile_id", userId).order("id").range(from, to));
  const threads = await chunks(idsOf(messages, "thread_id"), (ids, from, to) => db.from("inbox_threads")
    .select("id, property_id").in("id", ids).order("id").range(from, to));

  if (role === "tenant") {
    const leases = await pages((from, to) => db.from("leases")
      .select("id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, active")
      .eq("tenant_profile_id", userId).order("id").range(from, to));
    const charges = await chunks(idsOf(leases, "id"), (ids, from, to) => db.from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status, category")
      .in("lease_id", ids).is("deleted_at", null).order("id").range(from, to));
    const payments = await chunks(idsOf(charges, "id"), (ids, from, to) => db.from("payments")
      .select("id, rent_charge_id, amount_cents, paid_at, method")
      .in("rent_charge_id", ids).order("id").range(from, to));
    const repairs = await pages((from, to) => db.from("maintenance_tickets")
      .select("id, title, status, created_at, resolved_at")
      .eq("tenant_profile_id", userId).order("id").range(from, to));
    const units = await chunks(idsOf(leases, "unit_id"), (ids, from, to) => db.from("units")
      .select("id, property_id, unit_number").in("id", ids).order("id").range(from, to));
    const propertyIds = [...new Set([...idsOf(units, "property_id"), ...idsOf(threads, "property_id")])];
    const properties = await chunks(propertyIds, (ids, from, to) => db.from("properties")
      .select("id, name").in("id", ids).order("id").range(from, to));
    const unitMap = new Map(units.map((row) => [row.id, row]));
    const homeMap = new Map(properties.map((row) => [row.id, row.name]));
    const leaseMap = new Map(leases.map((row) => [row.id, row]));
    const chargeMap = new Map(charges.map((row) => [row.id, row]));
    const homeForLease = (leaseId: string) => {
      const unit = unitMap.get(leaseMap.get(leaseId)?.unit_id ?? "");
      return { home: homeMap.get(unit?.property_id ?? "") ?? "Unknown home", unit: unit?.unit_number ?? "Unknown unit" };
    };
    return {
      ...envelope(profile, role, generatedAt),
      leases: leases.map((row) => ({ ...homeForLease(row.id), startDate: iso(row.start_date), endDate: iso(row.end_date),
        monthlyRent: dollars(row.monthly_rent_cents), deposit: dollars(row.deposit_cents),
        dueDay: row.due_day_of_month, active: row.active })),
      rent: charges.map((row) => ({ ...homeForLease(row.lease_id), dueDate: iso(row.due_date),
        amount: dollars(row.amount_cents), status: row.status, kind: row.category })),
      payments: payments.map((row) => ({ dueDate: iso(chargeMap.get(row.rent_charge_id)?.due_date ?? null),
        amount: dollars(row.amount_cents), paidAt: iso(row.paid_at), method: paymentMethodLabel(row.method) })),
      repairs: repairs.map((row) => ({ title: row.title, status: row.status,
        reportedAt: iso(row.created_at), resolvedAt: iso(row.resolved_at) })),
      messagesYouSent: sentMessages(messages, threads, homeMap)
    };
  }

  const assignments = await pages((from, to) => db.from("property_managers")
    .select("property_id, active, assigned_at").eq("manager_profile_id", userId).order("property_id").range(from, to));
  const managerPayments = await pages((from, to) => db.from("manager_payments")
    .select("id, amount_cents, status, payment_date").eq("manager_profile_id", userId).order("id").range(from, to));
  const propertyIds = [...new Set([...idsOf(assignments, "property_id"), ...idsOf(threads, "property_id")])];
  const properties = await chunks(propertyIds, (ids, from, to) => db.from("properties")
    .select("id, name").in("id", ids).order("id").range(from, to));
  const homeMap = new Map(properties.map((row) => [row.id, row.name]));
  return {
    ...envelope(profile, role, generatedAt),
    homesManaged: assignments.map((row) => ({ home: homeMap.get(row.property_id) ?? "Unknown home",
      active: row.active, assignedAt: iso(row.assigned_at) })),
    managerPayments: managerPayments.map((row) => ({ amount: dollars(row.amount_cents), status: row.status,
      date: iso(row.payment_date) })),
    messagesYouSent: sentMessages(messages, threads, homeMap)
  };
}

function envelope(profile: {
  full_name: string; email: string; phone: string | null; nickname: string | null;
  role: string; created_at: string
}, role: "tenant" | "manager", generatedAt: string) {
  return { exportVersion: 1, generatedAt, accountRole: role, profile: {
    fullName: profile.full_name, email: profile.email, phone: profile.phone,
    nickname: profile.nickname, role: profile.role, createdAt: iso(profile.created_at)
  } };
}

function sentMessages(messages: Array<{ thread_id: string; created_at: string; body: string }>,
  threads: Array<{ id: string; property_id: string }>, homeMap: Map<string, string>) {
  const threadMap = new Map(threads.map((row) => [row.id, row.property_id]));
  // The requester wrote each message, so its text is exported unredacted.
  return messages.map((row) => ({ conversation: homeMap.get(threadMap.get(row.thread_id) ?? "") ?? "Unknown home",
    sentAt: iso(row.created_at), text: row.body }));
}
