import { todayDenver } from "@/lib/denver-calendar";
import { createClient } from "@/lib/supabase/server";

export type Partner = { id: string; accountId: string; displayName: string; active: boolean; profileId: string | null };
export type PartnerPayment = { id: string; fromPartnerId: string | null; toPartnerId: string | null;
  amountCents: number; paidOn: string;
  kind: "reimbursement" | "manager_fee" | "settle_up" | "other";
  status: "done" | "planned"; note: string | null };
export type PaidByKind = { cleaningRepairs: number; improvements: number; mortgage: number; utilities: number; other: number };
export type PartnerLine = { id: string | null; name: string; active: boolean; paidByKind: PaidByKind;
  paymentsInCents: number; paymentsOutCents: number; putInCents: number; sharePct: number;
  plannedDelta: number; projectedPutIn: number; projectedSharePct: number };
export type PartnerReport = { rows: PartnerLine[]; partners: Partner[]; payments: PartnerPayment[]; hasPlanned: boolean };
type Result<T> = { ok: true; data: T } | { ok: false; error: "not_allowed" | "unavailable" };
export type ReportRange = "all" | { from: string; to: string };

export function singleSelectedAccount(rows: Array<{ id: string; owner_account_id: string | null }>,
  selectedIds: string[]): string | null {
  const accounts = [...new Set(rows.filter((row) => selectedIds.includes(row.id))
    .map((row) => row.owner_account_id))];
  return accounts.length === 1 ? accounts[0] : null;
}

export async function checkPartnerAccess(accountId: string): Promise<Result<ReturnType<typeof createClient>>> {
  try {
    const client = createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { ok: false, error: "not_allowed" };
    const [member, account, profile] = await Promise.all([
      client.rpc("is_owner_member_of_account", { p_account_id: accountId }),
      client.from("ownership_accounts").select("account_type").eq("id", accountId).maybeSingle(),
      client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
    ]);
    if (member.error || account.error || profile.error || member.data !== true ||
      account.data?.account_type !== "llc" || profile.data?.role !== "owner") {
      return { ok: false, error: "not_allowed" };
    }
    return { ok: true, data: client };
  } catch { return { ok: false, error: "not_allowed" }; }
}

export async function loadPartners(accountId: string): Promise<Result<Partner[]>> {
  const access = await checkPartnerAccess(accountId);
  if (!access.ok) return access;
  try {
    const { data, error } = await access.data.from("account_partners")
      .select("id, account_id, display_name, active, profile_id").eq("account_id", accountId);
    if (error) return { ok: false, error: "unavailable" };
    return { ok: true, data: (data ?? []).map((row) => ({
      id: row.id, accountId: row.account_id, displayName: row.display_name,
      active: row.active, profileId: row.profile_id
    })) };
  } catch { return { ok: false, error: "unavailable" }; }
}

const blankKinds = (): PaidByKind => ({ cleaningRepairs: 0, improvements: 0, mortgage: 0, utilities: 0, other: 0 });
function kindOf(category: string): keyof PaidByKind {
  if (category === "repair" || category === "maintenance") return "cleaningRepairs";
  if (category === "improvement") return "improvements";
  if (category === "mortgage") return "mortgage";
  if (category === "utility") return "utilities";
  return "other";
}
export function calculatePartnerReport(partners: Partner[], expenses: Array<{ id: string; category: string;
  amount_cents: number; expense_date: string }>, attributions: Array<{ expense_id: string; partner_id: string }>,
  payments: PartnerPayment[], range: ReportRange, today: string): PartnerReport {
  const inRange = (day: string, planned = false) => (planned || day <= today)
    && (range === "all" || (day >= range.from && day < range.to));
  const rows = new Map<string | null, PartnerLine>();
  const line = (id: string | null, name: string, active: boolean): PartnerLine => ({ id, name, active,
    paidByKind: blankKinds(), paymentsInCents: 0, paymentsOutCents: 0, putInCents: 0,
    sharePct: 0, plannedDelta: 0, projectedPutIn: 0, projectedSharePct: 0 });
  rows.set(null, line(null, "The LLC", true));
  for (const partner of partners) rows.set(partner.id, line(partner.id, partner.displayName, partner.active));
  const payerByExpense = new Map(attributions.map((item) => [item.expense_id, item.partner_id]));
  const activity = new Set<string | null>();
  for (const expense of expenses) {
    if (!inRange(expense.expense_date)) continue;
    const payer = payerByExpense.get(expense.id) ?? null;
    const row = rows.get(payer);
    if (!row) continue;
    row.paidByKind[kindOf(expense.category)] += expense.amount_cents;
    row.putInCents += expense.amount_cents;
    activity.add(payer);
  }
  for (const payment of payments) {
    if (!inRange(payment.paidOn, payment.status === "planned")) continue;
    const from = rows.get(payment.fromPartnerId);
    const to = rows.get(payment.toPartnerId);
    if (!from || !to) continue;
    activity.add(payment.fromPartnerId);
    activity.add(payment.toPartnerId);
    if (payment.status === "planned") {
      from.plannedDelta += payment.amountCents;
      to.plannedDelta -= payment.amountCents;
    } else {
      from.paymentsOutCents += payment.amountCents;
      to.paymentsInCents += payment.amountCents;
      from.putInCents += payment.amountCents;
      to.putInCents -= payment.amountCents;
    }
  }
  const visible = [...rows.values()].filter((row) => row.id === null || row.active || activity.has(row.id));
  visible.sort((a, b) => a.id === null ? -1 : b.id === null ? 1 : a.name.localeCompare(b.name));
  const denominator = visible.reduce((sum, row) => sum + Math.max(0, row.putInCents), 0);
  const projectedDenominator = visible.reduce((sum, row) => sum + Math.max(0, row.putInCents + row.plannedDelta), 0);
  for (const row of visible) {
    row.projectedPutIn = row.putInCents + row.plannedDelta;
    row.sharePct = row.putInCents > 0 && denominator ? Math.round(row.putInCents * 100 / denominator) : 0;
    row.projectedSharePct = row.projectedPutIn > 0 && projectedDenominator
      ? Math.round(row.projectedPutIn * 100 / projectedDenominator) : 0;
  }
  return { rows: visible, partners, payments: payments.filter((payment) => inRange(payment.paidOn, payment.status === "planned")),
    hasPlanned: payments.some((payment) => payment.status === "planned" && inRange(payment.paidOn, true)) };
}

export async function loadPartnerReport(accountId: string, range: ReportRange): Promise<Result<PartnerReport>> {
  const access = await checkPartnerAccess(accountId);
  if (!access.ok) return access;
  try {
    const client = access.data;
    const [partnersResult, homesResult, paymentsResult] = await Promise.all([
      client.from("account_partners").select("id, account_id, display_name, active, profile_id").eq("account_id", accountId),
      client.from("properties").select("id").eq("owner_account_id", accountId),
      client.from("partner_payments")
        .select("id, from_partner_id, to_partner_id, amount_cents, paid_on, kind, status, note").eq("account_id", accountId)
    ]);
    if (partnersResult.error || homesResult.error || paymentsResult.error) return { ok: false, error: "unavailable" };
    const homeIds = (homesResult.data ?? []).map((home) => home.id);
    const expensesResult = homeIds.length
      ? await client.from("property_expenses").select("id, category, amount_cents, expense_date").in("property_id", homeIds)
      : { data: [], error: null };
    if (expensesResult.error) return { ok: false, error: "unavailable" };
    const expenseIds = (expensesResult.data ?? []).map((expense) => expense.id);
    const attributionResult = expenseIds.length
      ? await client.from("expense_partner_attributions").select("expense_id, partner_id").in("expense_id", expenseIds)
      : { data: [], error: null };
    if (attributionResult.error) return { ok: false, error: "unavailable" };
    const partners = (partnersResult.data ?? []).map((row) => ({ id: row.id, accountId: row.account_id,
      displayName: row.display_name, active: row.active, profileId: row.profile_id }));
    const payments = (paymentsResult.data ?? []).map((row) => ({ id: row.id, fromPartnerId: row.from_partner_id,
      toPartnerId: row.to_partner_id, amountCents: row.amount_cents, paidOn: row.paid_on,
      kind: row.kind as PartnerPayment["kind"], status: row.status as "done" | "planned", note: row.note }));
    return { ok: true, data: calculatePartnerReport(partners, expensesResult.data ?? [],
      attributionResult.data ?? [], payments, range, todayDenver()) };
  } catch { return { ok: false, error: "unavailable" }; }
}
