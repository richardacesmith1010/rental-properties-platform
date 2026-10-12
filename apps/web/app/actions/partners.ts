"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createPartnerSchema, updatePartnerSchema, deletePartnerSchema,
  createPartnerPaymentSchema, updatePartnerPaymentSchema, deletePartnerPaymentSchema,
  setExpensePaidBySchema } from "@/lib/validations";
import type { z } from "zod";

type Failure = { ok: false; error: string };
type Success<T = undefined> = { ok: true; data?: T };
const denied = (): Failure => ({ ok: false, error: "You do not have access to this LLC." });
const failed = (): Failure => ({ ok: false, error: "Could not save. Try again." });
const dbFailure = (error: unknown): Failure => isMissingSchemaError(error)
  ? { ok: false, error: "This feature requires a database update." } : failed();
const nameError = (error: { code?: string }): Failure => error.code === "23505"
  ? { ok: false, error: "Someone in this LLC already has that name." } : dbFailure(error);
function validate<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> | Failure {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
}
function isFailure(value: unknown): value is Failure {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as Failure).ok === false);
}
async function ownerClient(accountId: string) {
  try {
    const client = createClient();
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user || await getCurrentUserRole(auth.user.id) !== "owner") return null;
    const [member, account] = await Promise.all([
      client.rpc("is_owner_member_of_account", { p_account_id: accountId }),
      client.from("ownership_accounts").select("account_type").eq("id", accountId).maybeSingle()
    ]);
    if (member.error || account.error || member.data !== true || account.data?.account_type !== "llc") return null;
    return { client, userId: auth.user.id };
  } catch { return null; }
}
function refresh() { revalidatePath("/owner"); revalidatePath("/owner/money"); }

export async function addPartner(accountId: string, displayName: string): Promise<Failure | Success<{ id: string }>> {
  const owner = await ownerClient(accountId);
  if (!owner) return denied();
  const input = validate(createPartnerSchema, { accountId, displayName });
  if (isFailure(input)) return input;
  const { data, error } = await owner.client.from("account_partners")
    .insert({ account_id: accountId, display_name: input.displayName }).select("id").single();
  if (error) return nameError(error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function renamePartner(accountId: string, partnerId: string, displayName: string): Promise<Failure | Success> {
  const owner = await ownerClient(accountId);
  if (!owner) return denied();
  const input = validate(updatePartnerSchema, { accountId, partnerId, displayName });
  if (isFailure(input)) return input;
  const { data, error } = await owner.client.from("account_partners")
    .update({ display_name: input.displayName }).eq("account_id", accountId).eq("id", partnerId).select("id").maybeSingle();
  if (error) return nameError(error);
  if (!data) return denied();
  refresh();
  return { ok: true };
}

export async function deactivatePartner(accountId: string, partnerId: string): Promise<Failure | Success> {
  const owner = await ownerClient(accountId);
  if (!owner) return denied();
  const input = validate(deletePartnerSchema, { accountId, partnerId });
  if (isFailure(input)) return input;
  const { data, error } = await owner.client.from("account_partners")
    .update({ active: false }).eq("account_id", accountId).eq("id", partnerId).select("id").maybeSingle();
  if (error) return dbFailure(error);
  if (!data) return denied();
  refresh();
  return { ok: true };
}

type PaymentInput = z.infer<typeof createPartnerPaymentSchema>;
async function endpointsValid(owner: NonNullable<Awaited<ReturnType<typeof ownerClient>>>,
  accountId: string, input: PaymentInput): Promise<boolean> {
  const ids = [input.fromPartnerId, input.toPartnerId].filter((id): id is string => id !== null);
  const { data, error } = await owner.client.from("account_partners")
    .select("id").eq("account_id", accountId).eq("active", true).in("id", ids);
  return !error && (data ?? []).length === ids.length;
}
const paymentRow = (input: PaymentInput) => ({ from_partner_id: input.fromPartnerId,
  to_partner_id: input.toPartnerId, amount_cents: input.amountCents, paid_on: input.paidOn,
  kind: input.kind, status: input.status, note: input.note });

export async function addPartnerPayment(input: PaymentInput): Promise<Failure | Success<{ id: string }>> {
  const owner = await ownerClient(input.accountId);
  if (!owner) return denied();
  const parsed = validate(createPartnerPaymentSchema, input);
  if (isFailure(parsed)) return parsed;
  if (!await endpointsValid(owner, input.accountId, parsed)) return { ok: false, error: "Pick someone from this LLC." };
  const { data, error } = await owner.client.from("partner_payments")
    .insert({ account_id: input.accountId, ...paymentRow(parsed), created_by_profile_id: owner.userId })
    .select("id").single();
  if (error) return dbFailure(error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updatePartnerPayment(input: PaymentInput & { id: string }): Promise<Failure | Success> {
  const owner = await ownerClient(input.accountId);
  if (!owner) return denied();
  const parsed = validate(updatePartnerPaymentSchema, input);
  if (isFailure(parsed)) return parsed;
  const current = await owner.client.from("partner_payments")
    .select("from_partner_id, to_partner_id").eq("account_id", input.accountId).eq("id", input.id).maybeSingle();
  if (current.error) return dbFailure(current.error);
  if (!current.data) return denied();
  const endpointsChanged = current.data.from_partner_id !== parsed.fromPartnerId
    || current.data.to_partner_id !== parsed.toPartnerId;
  if (endpointsChanged && !await endpointsValid(owner, input.accountId, parsed)) {
    return { ok: false, error: "Pick someone from this LLC." };
  }
  const { data, error } = await owner.client.from("partner_payments").update(paymentRow(parsed))
    .eq("account_id", input.accountId).eq("id", input.id).select("id").maybeSingle();
  if (error) return dbFailure(error);
  if (!data) return denied();
  refresh();
  return { ok: true };
}

export async function deletePartnerPayment(accountId: string, id: string): Promise<Failure | Success> {
  const owner = await ownerClient(accountId);
  if (!owner) return denied();
  const parsed = validate(deletePartnerPaymentSchema, { accountId, id });
  if (isFailure(parsed)) return parsed;
  const { data, error } = await owner.client.from("partner_payments")
    .delete().eq("account_id", accountId).eq("id", id).select("id").maybeSingle();
  if (error) return dbFailure(error);
  if (!data) return denied();
  refresh();
  return { ok: true };
}

export async function setExpensePaidBy(expenseId: string, partnerId: string | null): Promise<Failure | Success> {
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || await getCurrentUserRole(auth.user.id) !== "owner") return denied();
  const parsed = validate(setExpensePaidBySchema, { expenseId, partnerId });
  if (isFailure(parsed)) return parsed;
  const { data: expense, error: expenseError } = await client.from("property_expenses")
    .select("property_id").eq("id", expenseId).maybeSingle();
  if (expenseError || !expense) return denied();
  const { data: property, error: propertyError } = await client.from("properties")
    .select("owner_account_id").eq("id", expense.property_id).maybeSingle();
  if (propertyError || !property?.owner_account_id) return denied();
  const accountId = property.owner_account_id;
  const owner = await ownerClient(accountId);
  if (!owner) return denied();
  if (partnerId) {
    const { data: partner, error } = await client.from("account_partners")
      .select("id").eq("account_id", accountId).eq("id", partnerId).eq("active", true).maybeSingle();
    if (error || !partner) return { ok: false, error: "Pick someone from this LLC." };
    const existing = await client.from("expense_partner_attributions")
      .select("expense_id, partner_id").eq("expense_id", expenseId).maybeSingle();
    if (existing.error) return dbFailure(existing.error);
    if (existing.data?.partner_id !== partnerId) {
      if (existing.data) {
        const saved = await client.from("expense_partner_attributions")
          .update({ partner_id: partnerId }).eq("expense_id", expenseId);
        if (saved.error) return dbFailure(saved.error);
      } else {
        const saved = await client.from("expense_partner_attributions")
          .insert({ expense_id: expenseId, account_id: accountId, partner_id: partnerId,
            created_by_profile_id: auth.user.id });
        if (saved.error) return dbFailure(saved.error);
      }
    }
  } else {
    const cleared = await client.from("expense_partner_attributions").delete().eq("expense_id", expenseId);
    if (cleared.error) return dbFailure(cleared.error);
  }
  refresh();
  return { ok: true };
}
