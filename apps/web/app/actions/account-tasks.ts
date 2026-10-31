"use server";

import { todayDenver } from "@/lib/denver-calendar";

import { requireAuth } from "./auth-helpers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { checkPartnerAccess } from "@/lib/partners";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { COMMON_TASKS, commonDue, nextDueAfter } from "@/lib/account-tasks";
import { createTaskSchema, updateTaskSchema, deleteTaskSchema,
  markTaskDoneSchema, addCommonTasksSchema } from "@/lib/validations";
import type { z } from "zod";

type Input = z.infer<typeof createTaskSchema>;
type Result = { ok: true } | { ok: false; error: string };
const denied = (): Result => ({ ok: false, error: "You do not have access to this LLC." });
const failure = (error: unknown): Result => ({ ok: false, error: isMissingSchemaError(error)
  ? "This feature requires a database update." : "Could not save. Try again." });
function refresh() { revalidatePath("/owner"); revalidatePath("/owner/money"); }
async function allowed(accountId: string) {
  const client = createClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user || await getCurrentUserRole(auth.user.id) !== "owner") return null;
  const access = await checkPartnerAccess(accountId);
  return access.ok ? { client: access.data, userId: auth.user.id } : null;
}
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> | { error: string } {
  const result = schema.safeParse(input);
  return result.success ? result.data : { error: result.error.issues[0]?.message ?? "Check the details and try again." };
}
function invalid(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}
async function ownerValid(client: ReturnType<typeof createClient>, accountId: string, partnerId: string | null): Promise<Result | null> {
  if (!partnerId) return null;
  const { data, error } = await client.from("account_partners").select("id")
    .eq("account_id", accountId).eq("id", partnerId).eq("active", true).maybeSingle();
  if (error) return failure(error);
  return data ? null : { ok: false, error: "Pick someone from this LLC." };
}
const fields = (input: Input) => ({ title: input.title, frequency: input.frequency,
  next_due_on: input.nextDueOn, owner_partner_id: input.ownerPartnerId });

export async function addTask(input: Omit<Input, "nextDueOn"> & { nextDueOn?: string | null }): Promise<Result> {
  await requireAuth("owner");
  const access = await allowed(input.accountId);
  if (!access) return denied();
  const normalized = { ...input, nextDueOn: input.nextDueOn === undefined
    ? input.frequency === "as_needed" ? null : todayDenver() : input.nextDueOn };
  const parsed = parse(createTaskSchema, normalized);
  if (invalid(parsed)) return { ok: false, error: parsed.error };
  const ownerError = await ownerValid(access.client, input.accountId, parsed.ownerPartnerId);
  if (ownerError) return ownerError;
  const { error } = await access.client.from("account_tasks")
    .insert({ account_id: input.accountId, ...fields(parsed), created_by_profile_id: access.userId });
  if (error) return failure(error);
  refresh(); return { ok: true };
}
export async function updateTask(input: Input & { taskId: string }): Promise<Result> {
  await requireAuth("owner");
  const access = await allowed(input.accountId);
  if (!access) return denied();
  const parsed = parse(updateTaskSchema, input);
  if (invalid(parsed)) return { ok: false, error: parsed.error };
  const ownerError = await ownerValid(access.client, input.accountId, parsed.ownerPartnerId);
  if (ownerError) return ownerError;
  const { data, error } = await access.client.from("account_tasks").update(fields(parsed))
    .eq("account_id", input.accountId).eq("id", input.taskId).eq("active", true).select("id").maybeSingle();
  if (error) return failure(error);
  if (!data) return denied();
  refresh(); return { ok: true };
}
export async function removeTask(accountId: string, taskId: string): Promise<Result> {
  await requireAuth("owner");
  const access = await allowed(accountId);
  if (!access) return denied();
  const parsed = parse(deleteTaskSchema, { accountId, taskId });
  if (invalid(parsed)) return { ok: false, error: parsed.error };
  const { data, error } = await access.client.from("account_tasks").update({ active: false })
    .eq("account_id", accountId).eq("id", taskId).eq("active", true).select("id").maybeSingle();
  if (error) return failure(error);
  if (!data) return denied();
  refresh(); return { ok: true };
}
export async function markTaskDone(taskId: string): Promise<Result> {
  await requireAuth("owner");
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || await getCurrentUserRole(auth.user.id) !== "owner") return denied();
  const { data: task, error: readError } = await client.from("account_tasks")
    .select("account_id,frequency,next_due_on,active").eq("id", taskId).maybeSingle();
  if (readError) return failure(readError);
  if (!task?.active) return denied();
  const access = await allowed(task.account_id);
  if (!access) return denied();
  const parsed = parse(markTaskDoneSchema, { accountId: task.account_id, taskId });
  if (invalid(parsed)) return { ok: false, error: parsed.error };
  const today = todayDenver();
  const next = nextDueAfter(task.frequency, task.next_due_on, today);
  const { data, error } = await access.client.from("account_tasks")
    .update({ last_done_on: today, next_due_on: next })
    .eq("id", taskId).eq("account_id", task.account_id).eq("active", true).select("id").maybeSingle();
  if (error) return failure(error);
  if (!data) return denied();
  refresh(); return { ok: true };
}
export async function addCommonTasks(accountId: string): Promise<Result> {
  await requireAuth("owner");
  const access = await allowed(accountId);
  if (!access) return denied();
  const parsed = parse(addCommonTasksSchema, { accountId });
  if (invalid(parsed)) return { ok: false, error: parsed.error };
  const { data: existing, error: readError } = await access.client.from("account_tasks")
    .select("title").eq("account_id", accountId);
  if (readError) return failure(readError);
  const titles = new Set((existing ?? []).map((row) => row.title.trim().toLocaleLowerCase()));
  const today = todayDenver();
  const rows = COMMON_TASKS.filter((task) => !titles.has(task.title.toLocaleLowerCase()))
    .map((task) => ({ account_id: accountId, title: task.title, frequency: task.frequency,
      next_due_on: commonDue(task.frequency, today), owner_partner_id: null, created_by_profile_id: access.userId }));
  if (rows.length) {
    const { error } = await access.client.from("account_tasks").insert(rows);
    if (error) return failure(error);
  }
  refresh(); return { ok: true };
}
