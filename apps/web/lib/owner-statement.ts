import "server-only";

import { getCheckedAuthUser, getCurrentUserRole } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { ownerStatementRequestSchema } from "@/lib/validations";
import { isActiveClientManager } from "@/lib/client-accounts";
import { paymentMethodLabel } from "@/lib/payment-method-label";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunks, fetchAllPages } from "@/lib/supabase-pagination";
import { denverDateFromTimestamp, isStatementMonth, statementMonthLabel,
  statementMonthWindow, statementPeriodLabel } from "@/lib/statement-month";

type Home = { id: string; name: string; active: boolean };
type Unit = { id: string; property_id: string; unit_number: string | null };
type Lease = { id: string; unit_id: string; tenant_profile_id: string | null };
type Profile = { id: string; full_name: string | null; email: string | null };
type Charge = { id: string; lease_id: string; due_date: string; amount_cents: number; category: string;
  status: string; deleted_at: string | null; waived_at: string | null };
type Payment = { id: string; rent_charge_id: string; paid_at: string; amount_cents: number;
  method: string; reversed_at: string | null };
type Expense = { id: string; property_id: string; category: string; description: string | null;
  amount_cents: number; expense_date: string };
export type StatementPayment = { date: string; homeLabel: string; tenantLabel: string;
  kindLabel: string; methodLabel: string; amountCents: number };
export type OwnerStatement = {
  account: { id: string; name: string; accountType: "individual" | "llc" };
  month: string; monthLabel: string; periodLabel: string;
  preparedBy: { name: string; email: string }; generatedAt: string;
  totals: { paymentsCents: number; expensesCents: number; netCents: number; stillOwedCents: number };
  homes: Array<{ id: string; name: string; archived: boolean; paymentsCents: number;
    expensesCents: number; netCents: number }>;
  payments: StatementPayment[];
  expenses: Array<{ date: string; homeLabel: string; kindLabel: string; note: string; amountCents: number }>;
  notCounted: Array<{ label: string; homeLabel: string; date: string; amountCents: number }>;
  owed: Array<{ homeLabel: string; dueDate: string; amountCents: number }>;
};
export class StatementAccessError extends Error { constructor() { super("Statement unavailable."); } }
export class StatementInvariantError extends Error { constructor() { super("Statement totals do not match."); } }
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const cmp = (a: string, b: string) => a.localeCompare(b, "en");
const paymentKinds: Record<string, string> = { rent: "Rent", late_fee: "Late fee", utility: "Utility", other: "Other" };
const expenseKinds: Record<string, string> = { mortgage: "Mortgage", insurance: "Insurance", property_tax: "Property tax",
  hoa: "HOA", repair: "Repair", maintenance: "Upkeep", utility: "Utility", management_fee: "Management fee",
  legal: "Legal", other: "Other" };

export function assertStatementInvariants(statement: OwnerStatement): void {
  const { totals, homes, payments, expenses, owed } = statement;
  if (totals.paymentsCents !== sum(payments.map((row) => row.amountCents)) ||
    totals.paymentsCents !== sum(homes.map((row) => row.paymentsCents)) ||
    totals.expensesCents !== sum(expenses.map((row) => row.amountCents)) ||
    totals.expensesCents !== sum(homes.map((row) => row.expensesCents)) ||
    homes.some((row) => row.netCents !== row.paymentsCents - row.expensesCents) ||
    totals.netCents !== totals.paymentsCents - totals.expensesCents ||
    totals.stillOwedCents !== sum(owed.map((row) => row.amountCents)) ||
    owed.some((row) => row.amountCents <= 0)) throw new StatementInvariantError();
}

function tenantName(name: string | null | undefined): string {
  const words = name?.trim().split(/\s+/) ?? [];
  return words.length >= 2 ? `${words[0][0]}. ${words.at(-1)}` : "Tenant";
}

export async function getOwnerStatement(managerId: string, accountId: string, month: string,
  now = new Date()): Promise<OwnerStatement> {
  if (!(await isActiveClientManager(managerId, accountId))) throw new StatementAccessError();
  if (!isStatementMonth(month, now)) throw new Error("Invalid statement month.");
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin.from("ownership_accounts")
    .select("id, display_name, account_type, managed_client").eq("id", accountId).maybeSingle();
  if (accountError) throw accountError;
  if (!account?.managed_client) throw new StatementAccessError();
  const { data: manager, error: managerError } = await admin.from("profiles")
    .select("id, full_name, email").eq("id", managerId).maybeSingle();
  if (managerError) throw managerError;
  if (!manager) throw new Error("Manager profile unavailable.");
  const homes = await fetchAllPages<Home>((from, to) => admin.from("properties")
    .select("id, name, active").eq("owner_account_id", accountId).order("id").range(from, to));
  const homeIds = homes.map((row) => row.id);
  const inPages = async <T>(ids: string[], query: (ids: string[], from: number, to: number) =>
    PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> =>
    (await Promise.all(chunks(ids).map((part) => fetchAllPages<T>((from, to) => query(part, from, to))))).flat();
  const units = await inPages<Unit>(homeIds, (ids, from, to) => admin.from("units")
    .select("id, property_id, unit_number").in("property_id", ids).order("id").range(from, to));
  const leases = await inPages<Lease>(units.map((row) => row.id), (ids, from, to) => admin.from("leases")
    .select("id, unit_id, tenant_profile_id").in("unit_id", ids).order("id").range(from, to));
  const charges = await inPages<Charge>(leases.map((row) => row.id), (ids, from, to) => admin.from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, category, status, deleted_at, waived_at")
    .in("lease_id", ids).order("id").range(from, to));
  const payments = await inPages<Payment>(charges.map((row) => row.id), (ids, from, to) => admin.from("payments")
    .select("id, rent_charge_id, paid_at, amount_cents, method, reversed_at")
    .in("rent_charge_id", ids).order("id").range(from, to));
  const profiles = await inPages<Profile>([...new Set(leases.map((row) => row.tenant_profile_id).filter((id): id is string => !!id))],
    (ids, from, to) => admin.from("profiles").select("id, full_name, email")
      .in("id", ids).order("id").range(from, to));
  const window = statementMonthWindow(month);
  const startMs = Date.parse(window.start);
  const nextMs = Date.parse(window.next);
  const ms = (value: string): number => {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) throw new Error("Invalid statement timestamp.");
    return parsed;
  };
  const expenses = await inPages<Expense>(homeIds, (ids, from, to) => admin.from("property_expenses")
    .select("id, property_id, category, description, amount_cents, expense_date")
    .in("property_id", ids).gte("expense_date", window.startDate).lt("expense_date", window.nextDate)
    .order("id").range(from, to));
  const unitMap = new Map(units.map((row) => [row.id, row]));
  const leaseMap = new Map(leases.map((row) => [row.id, row]));
  const profileMap = new Map(profiles.map((row) => [row.id, row]));
  const homeMap = new Map(homes.map((row) => [row.id, row]));
  const chargeMap = new Map(charges.map((row) => [row.id, row]));
  const unitCounts = new Map<string, number>();
  for (const unit of units) unitCounts.set(unit.property_id, (unitCounts.get(unit.property_id) ?? 0) + 1);
  const homeFor = (charge: Charge) => homeMap.get(unitMap.get(leaseMap.get(charge.lease_id)?.unit_id ?? "")?.property_id ?? "");
  const labelFor = (charge: Charge) => {
    const unit = unitMap.get(leaseMap.get(charge.lease_id)?.unit_id ?? "");
    const home = homeMap.get(unit?.property_id ?? "");
    return `${home?.name ?? "Home"}${unit && (unitCounts.get(unit.property_id) ?? 0) > 1 ? `, Unit ${unit.unit_number ?? ""}` : ""}`;
  };
  const inMonth = (value: string | null) => value != null && ms(value) >= startMs && ms(value) < nextMs;
  const deleted = (charge: Charge) => charge.deleted_at != null && ms(charge.deleted_at) < nextMs;
  const waived = (charge: Charge) => charge.status === "waived" &&
    (charge.waived_at == null || ms(charge.waived_at) < nextMs);
  const paymentsByCharge = new Map<string, Payment[]>();
  for (const payment of payments) {
    const rows = paymentsByCharge.get(payment.rent_charge_id) ?? [];
    rows.push(payment);
    paymentsByCharge.set(payment.rent_charge_id, rows);
  }
  const paymentLines: Array<StatementPayment & { id: string; order: number; homeId: string }> = [];
  const notCounted: Array<OwnerStatement["notCounted"][number] & { id: string; homeId: string }> = [];
  const owed: Array<OwnerStatement["owed"][number] & { id: string; homeId: string }> = [];
  const expenseLines: Array<OwnerStatement["expenses"][number] & { id: string; homeId: string }> = [];
  for (const payment of payments) {
    const charge = chargeMap.get(payment.rent_charge_id);
    if (!charge || deleted(charge)) continue;
    const home = homeFor(charge);
    if (!home) throw new Error("Statement home unavailable.");
    const lease = leaseMap.get(charge.lease_id);
    const base = { homeLabel: labelFor(charge), tenantLabel: tenantName(profileMap.get(lease?.tenant_profile_id ?? "")?.full_name),
      methodLabel: paymentMethodLabel(payment.method), homeId: home.id, id: payment.id };
    if (charge.category === "deposit") {
      if (inMonth(payment.paid_at)) notCounted.push({ id: payment.id, homeId: home.id, homeLabel: base.homeLabel,
        label: "Security deposit held", date: denverDateFromTimestamp(payment.paid_at), amountCents: payment.amount_cents });
      if (inMonth(payment.reversed_at)) notCounted.push({ id: payment.id, homeId: home.id, homeLabel: base.homeLabel,
        label: "Security deposit returned", date: denverDateFromTimestamp(payment.reversed_at!), amountCents: -payment.amount_cents });
      continue;
    }
    if (inMonth(payment.paid_at)) paymentLines.push({ ...base, order: 0,
      date: denverDateFromTimestamp(payment.paid_at), kindLabel: paymentKinds[charge.category] ?? "Other",
      amountCents: payment.amount_cents });
    if (inMonth(payment.reversed_at)) paymentLines.push({ ...base, order: 1,
      date: denverDateFromTimestamp(payment.reversed_at!), kindLabel: "Reversed", amountCents: -payment.amount_cents });
  }
  for (const charge of charges) {
    if (deleted(charge)) continue;
    const home = homeFor(charge);
    if (!home) throw new Error("Statement home unavailable.");
    if (inMonth(charge.waived_at) && charge.status === "waived") notCounted.push({ id: charge.id,
      homeId: home.id, homeLabel: labelFor(charge), label: "Waived",
      date: denverDateFromTimestamp(charge.waived_at!), amountCents: charge.amount_cents });
    if (charge.category === "deposit" || charge.due_date > window.endDate || waived(charge)) continue;
    const paid = sum((paymentsByCharge.get(charge.id) ?? []).filter((row) => ms(row.paid_at) < nextMs &&
      (row.reversed_at == null || ms(row.reversed_at) >= nextMs)).map((row) => row.amount_cents));
    const amountCents = Math.max(0, charge.amount_cents - paid);
    if (amountCents > 0) owed.push({ id: charge.id, homeId: home.id,
      homeLabel: labelFor(charge), dueDate: charge.due_date, amountCents });
  }
  for (const expense of expenses) {
    const home = homeMap.get(expense.property_id);
    if (!home) throw new Error("Statement home unavailable.");
    expenseLines.push({ id: expense.id, homeId: home.id, homeLabel: home.name, date: expense.expense_date,
      kindLabel: expenseKinds[expense.category] ?? "Other", note: expense.description ?? "", amountCents: expense.amount_cents });
  }
  paymentLines.sort((a, b) => cmp(a.date, b.date) || cmp(a.homeLabel, b.homeLabel) || cmp(a.id, b.id) || a.order - b.order);
  expenseLines.sort((a, b) => cmp(a.date, b.date) || cmp(a.homeLabel, b.homeLabel) || cmp(a.id, b.id));
  notCounted.sort((a, b) => cmp(a.date, b.date) || cmp(a.label, b.label) || cmp(a.homeLabel, b.homeLabel) || cmp(a.id, b.id));
  owed.sort((a, b) => cmp(a.dueDate, b.dueDate) || cmp(a.homeLabel, b.homeLabel) || cmp(a.id, b.id));
  const activity = new Set([...paymentLines, ...expenseLines, ...notCounted, ...owed].map((row) => row.homeId));
  const homeRows = homes.filter((home) => home.active || activity.has(home.id)).map((home) => {
    const paymentsCents = sum(paymentLines.filter((row) => row.homeId === home.id).map((row) => row.amountCents));
    const expensesCents = sum(expenseLines.filter((row) => row.homeId === home.id).map((row) => row.amountCents));
    return { id: home.id, name: home.name, archived: !home.active, paymentsCents,
      expensesCents, netCents: paymentsCents - expensesCents };
  }).sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
  const paymentsCents = sum(paymentLines.map((row) => row.amountCents));
  const expensesCents = sum(expenseLines.map((row) => row.amountCents));
  const strip = <T extends { id: string; homeId: string }>(row: T): Omit<T, "id" | "homeId"> => {
    const { id: _id, homeId: _homeId, ...rest } = row; return rest;
  };
  const statement: OwnerStatement = { account: { id: account.id, name: account.display_name,
    accountType: account.account_type }, month, monthLabel: statementMonthLabel(month),
    periodLabel: statementPeriodLabel(month), preparedBy: { name: manager.full_name ?? "Manager",
      email: manager.email ?? "" }, generatedAt: now.toISOString(),
    totals: { paymentsCents, expensesCents, netCents: paymentsCents - expensesCents,
      stillOwedCents: sum(owed.map((row) => row.amountCents)) }, homes: homeRows,
    payments: paymentLines.map((row) => { const { order: _order, ...rest } = row; return strip(rest); }),
    expenses: expenseLines.map(strip), notCounted: notCounted.map(strip), owed: owed.map(strip) };
  assertStatementInvariants(statement);
  return statement;
}

export function statementFilename(statement: OwnerStatement, extension: "pdf" | "csv"): string {
  const slug = statement.account.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/g, "") || "client";
  return `owner-statement-${slug}-${statement.month}.${extension}`;
}

export async function loadStatementDownload(request: Request, now = new Date()): Promise<
  { ok: true; statement: OwnerStatement } | { ok: false; response: Response }> {
  const failure = (status: number, error: string) => ({ ok: false as const,
    response: Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store" } }) });
  try {
    const user = await getCheckedAuthUser(createClient());
    if (!user) return failure(401, "Please sign in.");
    if (await getCurrentUserRole(user.id) !== "manager") return failure(403, "Access denied.");
    if (!checkRateLimit(`ownerStatement:${user.id}`, 30, 3_600_000).allowed)
      return failure(429, "Too many downloads. Try again later.");
    const params = new URL(request.url).searchParams;
    const parsed = ownerStatementRequestSchema.safeParse({ accountId: params.get("accountId"), month: params.get("month") });
    if (!parsed.success || !isStatementMonth(parsed.data.month, now)) return failure(400, "Pick a month from the list.");
    const statement = await getOwnerStatement(user.id, parsed.data.accountId, parsed.data.month, now);
    return { ok: true, statement };
  } catch (error) {
    if (error instanceof StatementAccessError) return failure(404, "Statement unavailable.");
    console.error("Owner statement download failed", error);
    return failure(500, "Could not make the statement. Please try again.");
  }
}
