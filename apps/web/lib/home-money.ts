import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { escapeCell } from "@/lib/csv-export-reports";

export interface Entry {
  id: string; date: string; kind: "rent" | "bill"; title: string; detail: string;
  category: string; amountCents: number; direction: "in" | "out"; source: string;
}
export interface MoneyAlert { type: "late-rent" | "higher-than-usual"; title: string; detail: string; }
export interface HomeMoney { property: { id: string; name: string }; entries: Entry[]; totals: {
  inCents: number; outCents: number; leftCents: number;
} }

const labels: Record<string, string> = {
  mortgage: "Mortgage", insurance: "Insurance", property_tax: "Property tax", hoa: "HOA",
  repair: "Repair", maintenance: "Maintenance", utility: "Utility", management_fee: "Management fee",
  legal: "Legal", other: "Other"
};
const dateOnly = (value: string) => value.includes("T") ? value.slice(0, 10) : value;
const categoryLabel = (category: string | null | undefined) => labels[category ?? ""] ?? (category || "Other");
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function runningBalance(entries: Entry[]) {
  let balanceCents = 0;
  return entries.map((entry) => {
    balanceCents += entry.direction === "in" ? entry.amountCents : -entry.amountCents;
    return { ...entry, balanceCents };
  });
}

export function groupByCategory(entries: Entry[]) {
  const groups = new Map<string, { label: string; direction: "in" | "out"; amountCents: number }>();
  for (const entry of entries) {
    const label = entry.direction === "in" ? "Rent" : entry.title || categoryLabel(entry.category);
    const key = `${entry.direction}:${label}`;
    const prior = groups.get(key);
    groups.set(key, { label, direction: entry.direction, amountCents: (prior?.amountCents ?? 0) + entry.amountCents });
  }
  return [...groups.values()].sort((a, b) => a.direction === "in" ? -1 : b.direction === "in" ? 1 : b.amountCents - a.amountCents);
}

function monthBounds(month: string) {
  const [year, value] = month.split("-").map(Number);
  const from = `${year}-${String(value).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, value, 1));
  return { from, to: next.toISOString().slice(0, 10) };
}

async function checked<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error("Home money data unavailable.");
  return data as T;
}

async function loadRows(propertyId: string, from: string, to: string) {
  const admin = createAdminClient();
  const [property, units] = await Promise.all([
    checked(admin.from("properties").select("id, name").eq("id", propertyId).maybeSingle()),
    checked(admin.from("units").select("id").eq("property_id", propertyId))
  ]);
  const unitIds = (units ?? []).map((row) => row.id);
  const leases = unitIds.length ? await checked(admin.from("leases")
    .select("id, unit_id, tenant_profile_id, grace_period_days, active").in("unit_id", unitIds)) : [];
  const leaseIds = leases.map((row) => row.id);
  const profileIds = [...new Set(leases.map((row) => row.tenant_profile_id).filter((id): id is string => Boolean(id)))];
  const [charges, expenses, profiles] = await Promise.all([
    leaseIds.length ? checked(admin.from("rent_charges")
      .select("id, lease_id, category, amount_cents, due_date, status, deleted_at")
      .in("lease_id", leaseIds).is("deleted_at", null)) : Promise.resolve([]),
    checked(admin.from("property_expenses")
      .select("id, property_id, category, description, amount_cents, expense_date")
      .eq("property_id", propertyId).gte("expense_date", from).lt("expense_date", to)),
    profileIds.length ? checked(admin.from("profiles").select("id, full_name, nickname").in("id", profileIds))
      : Promise.resolve([])
  ]);
  const chargeIds = charges.map((row) => row.id);
  const payments = chargeIds.length ? await checked(admin.from("payments")
    .select("id, rent_charge_id, amount_cents, paid_at, reversed_at, method, stripe_payment_intent_id")
    .in("rent_charge_id", chargeIds).gte("paid_at", from).lt("paid_at", to)) : [];
  const paymentIds = payments.filter((row) => !row.reversed_at).map((row) => row.id);
  const expenseIds = expenses.map((row) => row.id);
  const [paymentLinks, expenseLinks] = await Promise.all([
    paymentIds.length ? checked(admin.from("bank_transactions")
      .select("payment_id, expense_id, bank_account_id").in("payment_id", paymentIds)) : Promise.resolve([]),
    expenseIds.length ? checked(admin.from("bank_transactions")
      .select("payment_id, expense_id, bank_account_id").in("expense_id", expenseIds)) : Promise.resolve([])
  ]);
  const bankRows = [...paymentLinks, ...expenseLinks];
  const accountIds = [...new Set(bankRows.map((row) => row.bank_account_id).filter((id): id is string => Boolean(id)))];
  const accounts = accountIds.length ? await checked(admin.from("bank_accounts")
    .select("id, nickname").in("id", accountIds)) : [];
  const profileMap = new Map(profiles.map((row) => [row.id, row.full_name || row.nickname || "Tenant"]));
  const accountMap = new Map(accounts.map((row) => [row.id, row.nickname]));
  const bankByPayment = new Map(bankRows.filter((row) => row.payment_id)
    .map((row) => [row.payment_id, accountMap.get(row.bank_account_id)]));
  const bankByExpense = new Map(bankRows.filter((row) => row.expense_id)
    .map((row) => [row.expense_id, accountMap.get(row.bank_account_id)]));
  const leaseMap = new Map(leases.map((row) => [row.id, row]));
  const chargeMap = new Map(charges.map((row) => [row.id, row]));
  const entries: Entry[] = [];
  for (const payment of payments) {
    if (payment.reversed_at) continue;
    const charge = chargeMap.get(payment.rent_charge_id);
    if (!charge) continue;
    const lease = leaseMap.get(charge.lease_id);
    const date = dateOnly(payment.paid_at);
    if (date < from || date >= to) continue;
    entries.push({
      id: payment.id, date, kind: "rent",
      title: lease?.tenant_profile_id ? `Rent from ${profileMap.get(lease.tenant_profile_id) ?? "Tenant"}` : "Rent",
      detail: "Rent", category: "rent", amountCents: payment.amount_cents, direction: "in",
      source: bankByPayment.get(payment.id) ? `From bank: ${bankByPayment.get(payment.id)}`
        : payment.stripe_payment_intent_id ? "Paid online" : plainMethod(payment.method)
    });
  }
  for (const expense of expenses) {
    const description = expense.description?.split(" · ")[0]?.trim();
    entries.push({
      id: expense.id, date: dateOnly(expense.expense_date), kind: "bill",
      title: description || categoryLabel(expense.category),
      detail: expense.description || categoryLabel(expense.category), category: expense.category,
      amountCents: expense.amount_cents, direction: "out",
      source: bankByExpense.get(expense.id) ? `From bank: ${bankByExpense.get(expense.id)}` : "Added by you"
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { property: property ?? { id: propertyId, name: "Home" }, entries, charges, leases, profileMap };
}

export function plainMethod(method: string | null | undefined) {
  const value = method?.toLowerCase();
  return value === "ach" ? "Bank transfer" : value === "card" ? "Card"
    : value === "cash" ? "Cash" : value === "check" ? "Check"
      : value === "other" ? "Paid outside Domus" : "Other";
}

export async function loadHomeMoney(userId: string, propertyId: string,
  range: { from: string; to: string }): Promise<HomeMoney | null> {
  if (!(await canUserAdministerProperty(userId, propertyId))) return null;
  const { property, entries } = await loadRows(propertyId, range.from, range.to);
  const inCents = entries.filter((entry) => entry.direction === "in")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const outCents = entries.filter((entry) => entry.direction === "out")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  return { property, entries, totals: { inCents, outCents, leftCents: inCents - outCents } };
}

export async function loadHomeAlerts(userId: string, propertyId: string, today: string): Promise<MoneyAlert[]> {
  if (!(await canUserAdministerProperty(userId, propertyId))) return [];
  const month = today.slice(0, 7);
  const current = monthBounds(month);
  const start = new Date(`${current.from}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 3);
  const rows = await loadRows(propertyId, start.toISOString().slice(0, 10), current.to);
  const alerts: MoneyAlert[] = [];
  const leaseMap = new Map(rows.leases.map((row) => [row.id, row]));
  for (const charge of rows.charges) {
    if (charge.due_date < current.from || charge.due_date >= current.to) continue;
    if (charge.category !== "rent" || !["pending", "late"].includes(charge.status)) continue;
    const lease = leaseMap.get(charge.lease_id);
    if (!lease?.active) continue;
    const due = new Date(`${charge.due_date}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + (lease.grace_period_days ?? 4));
    if (today > due.toISOString().slice(0, 10)) alerts.push({
      type: "late-rent",
      title: `Rent from ${rows.profileMap.get(lease.tenant_profile_id) ?? "Tenant"} hasn't arrived`,
      detail: `It was due ${new Date(`${charge.due_date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short", day: "numeric", timeZone: "UTC"
      })}.`
    });
  }
  const monthly = new Map<string, Map<string, number>>();
  for (const entry of rows.entries.filter((item) => item.direction === "out")) {
    const key = entry.date.slice(0, 7);
    const label = entry.title || categoryLabel(entry.category);
    const amounts = monthly.get(key) ?? new Map<string, number>();
    amounts.set(label, (amounts.get(label) ?? 0) + entry.amountCents);
    monthly.set(key, amounts);
  }
  for (const [label, amountCents] of monthly.get(month) ?? []) {
    const prior: number[] = [];
    for (let offset = 1; offset <= 3; offset += 1) {
      const date = new Date(`${current.from}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - offset);
      const value = monthly.get(date.toISOString().slice(0, 7))?.get(label);
      if (value !== undefined) prior.push(value);
    }
    if (prior.length < 2) continue;
    const average = prior.reduce((sum, value) => sum + value, 0) / prior.length;
    if (amountCents >= average * 1.3) alerts.push({
      type: "higher-than-usual", title: `${label} is higher than usual`,
      detail: `${money(amountCents)} this month vs. about ${money(Math.round(average))} most months.`
    });
  }
  return alerts.slice(0, 5);
}

export function homeMoneyCsv(entries: Array<Entry & { balanceCents?: number }>) {
  const rows = entries.map((entry) => [entry.date, `${entry.title}${entry.source ? ` · ${entry.source}` : ""}`, entry.kind,
    entry.category, entry.direction === "in" ? (entry.amountCents / 100).toFixed(2) : "",
    entry.direction === "out" ? (entry.amountCents / 100).toFixed(2) : "",
    ((entry.balanceCents ?? 0) / 100).toFixed(2), entry.source]);
  return [["Date", "What", "Type", "Category", "In", "Out", "Balance", "Source"], ...rows]
    .map((row) => row.map(escapeCell).join(",")).join("\n");
}
