import { createClient } from "@/lib/supabase/server";
import { checkPartnerAccess, loadPartners, type Partner } from "@/lib/partners";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export type TaskFrequency = "monthly" | "quarterly" | "yearly" | "as_needed";
export type AccountTask = { id: string; accountId: string; title: string; frequency: TaskFrequency;
  nextDueOn: string | null; ownerPartnerId: string | null; ownerName: string | null;
  lastDoneOn: string | null; active: boolean };
type Result<T> = { ok: true; data: T } | { ok: false; error: "not_allowed" | "unavailable" };
const day = (value: string | Date) => typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export function nextDueAfter(frequency: TaskFrequency, currentDue: string | null, today: string): string | null {
  if (frequency === "as_needed") return null;
  if (!currentDue) throw new Error("A recurring task needs a due date.");
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const [year, month, date] = currentDue.split("-").map(Number);
  let step = 1;
  while (step < 1200) {
    const target = new Date(Date.UTC(year, month - 1 + step * months, 1));
    const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(date, end));
    const next = day(target);
    if (next > today) return next;
    step++;
  }
  throw new Error("The due date is too far in the past.");
}
export const COMMON_TASKS: ReadonlyArray<{ title: string; frequency: TaskFrequency }> = [
  { title: "Manage the tenant's mortgage payment", frequency: "monthly" },
  { title: "Manage the tenant's utility payments", frequency: "monthly" },
  { title: "Pay the mortgage", frequency: "monthly" },
  { title: "Pay vendors", frequency: "as_needed" },
  { title: "Schedule repairs", frequency: "as_needed" },
  { title: "Keep records", frequency: "monthly" },
  { title: "Prepare the lease", frequency: "yearly" },
  { title: "Send rent increase letters", frequency: "yearly" },
  { title: "Talk through rent increases", frequency: "yearly" },
  { title: "Request tax documents from PFFCU", frequency: "yearly" },
  { title: "Prepare tax documents", frequency: "yearly" },
  { title: "Shop for homeowners insurance", frequency: "as_needed" }
];
export function commonDue(frequency: TaskFrequency, today: string): string | null {
  if (frequency === "as_needed") return null;
  const [year, month] = today.split("-").map(Number);
  return frequency === "monthly" ? day(new Date(Date.UTC(year, month, 1))) : `${year + 1}-01-31`;
}
export async function loadAccountTasks(accountId: string): Promise<Result<{ tasks: AccountTask[]; partners: Partner[] }>> {
  const access = await checkPartnerAccess(accountId);
  if (!access.ok) return access;
  const [tasks, partners] = await Promise.all([
    access.data.from("account_tasks")
      .select("id,account_id,title,frequency,next_due_on,owner_partner_id,last_done_on,active")
      .eq("account_id", accountId).eq("active", true),
    loadPartners(accountId)
  ]);
  if (tasks.error || !partners.ok) return { ok: false, error: "unavailable" };
  const names = new Map(partners.data.map((partner) => [partner.id, partner.displayName]));
  const rows: AccountTask[] = (tasks.data ?? []).map((row) => ({ id: row.id, accountId: row.account_id,
    title: row.title, frequency: row.frequency as TaskFrequency, nextDueOn: row.next_due_on,
    ownerPartnerId: row.owner_partner_id, ownerName: names.get(row.owner_partner_id) ?? null,
    lastDoneOn: row.last_done_on, active: row.active }));
  rows.sort((a, b) => (a.nextDueOn ?? "9999-12-31").localeCompare(b.nextDueOn ?? "9999-12-31")
    || a.title.localeCompare(b.title));
  return { ok: true, data: { tasks: rows, partners: partners.data } };
}
export async function countMyDueTasks(userId: string, today: Date): Promise<number> {
  const client = createClient();
  const partners = await client.from("account_partners").select("id,account_id")
    .eq("profile_id", userId).eq("active", true);
  if (partners.error) {
    if (isMissingSchemaError(partners.error)) return 0;
    throw partners.error;
  }
  const partnerIds = (partners.data ?? []).map((partner) => partner.id);
  if (!partnerIds.length) return 0;
  const limit = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7));
  const tasks = await client.from("account_tasks")
    .select("id", { count: "exact", head: true }).in("owner_partner_id", partnerIds)
    .eq("active", true).lte("next_due_on", day(limit));
  if (tasks.error) {
    if (isMissingSchemaError(tasks.error)) return 0;
    throw tasks.error;
  }
  return tasks.count ?? 0;
}
