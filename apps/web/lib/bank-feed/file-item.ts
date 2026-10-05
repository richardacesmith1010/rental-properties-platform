import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankChoice, BankRow } from "./types";

type Admin = SupabaseClient;
export interface FileContext {
  admin: Admin; userId: string; bankAccountId: string; nickname: string; row: BankRow;
  matchedBy: "owner" | "rule" | "auto"; ruleId?: string | null;
}
export type FileResult = { success: true; id: string; createdRecord: boolean; alreadyRecorded?: boolean }
  | { success: false; error: string; already?: boolean };

function failure(operation: string): FileResult {
  console.error(operation);
  return { success: false, error: "We could not file this item. Try again." };
}

async function otherPayments(admin: Admin, chargeId: string): Promise<boolean | null> {
  const { data, error } = await admin.from("payments").select("id").eq("rent_charge_id", chargeId)
    .is("reversed_at", null).limit(1);
  if (error) { console.error("bank_other_payments"); return null; }
  return (data?.length ?? 0) > 0;
}

async function restoreCharge(admin: Admin, chargeId: string, priorStatus: "pending" | "late"): Promise<boolean> {
  const hasOther = await otherPayments(admin, chargeId);
  if (hasOther === null) return false;
  if (hasOther) return true;
  const { data, error } = await admin.from("rent_charges").update({ status: priorStatus })
    .eq("id", chargeId).eq("status", "paid").select("id");
  if (error || data?.length !== 1) { console.error("bank_restore_charge"); return false; }
  return true;
}

async function insertBankItem(ctx: FileContext, kind: "rent" | "expense" | "transfer",
  refs: Record<string, unknown>): Promise<FileResult> {
  const { data, error } = await ctx.admin.from("bank_transactions").insert({
    bank_account_id: ctx.bankAccountId, fingerprint: ctx.row.fingerprint, posted_on: ctx.row.postedOn,
    amount_cents: ctx.row.amountCents, direction: ctx.row.direction, description: ctx.row.description,
    kind, matched_by: ctx.matchedBy, rule_id: ctx.ruleId || null, created_by_profile_id: ctx.userId, ...refs
  }).select("id").single();
  if (error) return error.code === "23505" ? { success: false, error: "Already filed.", already: true }
    : failure("bank_insert_item");
  return { success: true, id: data.id, createdRecord: refs.created_record === true,
    alreadyRecorded: kind === "rent" && refs.created_record === false };
}

export async function fileBankItem(ctx: FileContext, choice: BankChoice,
  charge?: { id: string; lease_id: string; property_id: string; amount_cents: number; status: string }): Promise<FileResult> {
  const { admin, row } = ctx;
  if (choice.kind === "transfer") return insertBankItem(ctx, "transfer", { created_record: false });
  if (choice.kind === "expense") {
    if (row.direction !== "out") return { success: false, error: "Money in cannot be a bill." };
    const { data: expense, error } = await admin.from("property_expenses").insert({
      property_id: choice.propertyId, created_by_profile_id: ctx.userId, category: choice.category,
      description: `${choice.label} · ${row.description.slice(0, 80)}`, amount_cents: row.amountCents,
      expense_date: row.postedOn, recurring: false
    }).select("id").single();
    if (error) return failure("bank_insert_expense");
    const result = await insertBankItem(ctx, "expense", { property_id: choice.propertyId,
      expense_id: expense.id, created_record: true });
    if (!result.success) {
      const { error: deleteError, count } = await admin.from("property_expenses").delete({ count: "exact" }).eq("id", expense.id);
      if (deleteError || count !== 1) console.error("bank_delete_expense_compensation");
    }
    return result;
  }
  if (!charge || choice.rentChargeId !== charge.id || row.direction !== "in") {
    return { success: false, error: "We could not find this rent." };
  }
  if (charge.amount_cents !== row.amountCents) {
    return { success: false, error: "This amount does not match the rent. Record it from the Rent page." };
  }
  const refs = { property_id: charge.property_id, lease_id: charge.lease_id, rent_charge_id: charge.id };
  if (charge.status === "paid") {
    const { data: payments, error } = await admin.from("payments").select("id")
      .eq("rent_charge_id", charge.id).is("reversed_at", null).limit(2);
    if (error) return failure("bank_load_paid_payments");
    return insertBankItem(ctx, "rent", { ...refs, payment_id: payments?.length === 1 ? payments[0].id : null,
      created_record: false });
  }
  if (charge.status !== "pending" && charge.status !== "late") {
    return { success: false, error: "This rent is not ready to file." };
  }
  const priorStatus = charge.status;
  const { data: claimed, error: claimError } = await admin.from("rent_charges").update({ status: "paid" })
    .eq("id", charge.id).eq("status", priorStatus).select("id");
  if (claimError) return failure("bank_claim_charge");
  if (claimed?.length !== 1) return { success: false, error: "This rent was just recorded. Refresh to see it." };
  const { data: payment, error: paymentError } = await admin.from("payments").insert({
    rent_charge_id: charge.id, amount_cents: row.amountCents, method: "ach",
    reference_note: `From bank: ${ctx.nickname}`, paid_at: `${row.postedOn}T12:00:00.000Z`
  }).select("id").single();
  if (paymentError) {
    await restoreCharge(admin, charge.id, priorStatus);
    return failure("bank_insert_payment");
  }
  const result = await insertBankItem(ctx, "rent", { ...refs, payment_id: payment.id,
    created_record: true, prior_charge_status: priorStatus });
  if (!result.success) {
    const { error: deleteError, count } = await admin.from("payments").delete({ count: "exact" }).eq("id", payment.id);
    if (deleteError || count !== 1) console.error("bank_delete_payment_compensation");
    await restoreCharge(admin, charge.id, priorStatus);
  }
  return result;
}

export async function undoFiledItem(admin: Admin, item: {
  id: string; kind: string; created_record: boolean; payment_id: string | null;
  expense_id: string | null; rent_charge_id: string | null; prior_charge_status: "pending" | "late" | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!item.created_record) return { success: false, error: "This item cannot be undone here." };
  const table = item.kind === "rent" ? "payments" : "property_expenses";
  const id = item.kind === "rent" ? item.payment_id : item.expense_id;
  if (!id) return { success: false, error: "This item cannot be undone here." };
  const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("id", id);
  if (error || count !== 1) return { success: false, error: "We could not undo this item." };
  if (item.kind === "rent" && item.rent_charge_id && item.prior_charge_status) {
    const { data: charge, error: chargeError } = await admin.from("rent_charges")
      .select("status").eq("id", item.rent_charge_id).maybeSingle();
    if (chargeError) return { success: false, error: "Rent was removed, but its status could not be checked." };
    if (charge?.status === "waived") return { success: true };
    if (!await restoreCharge(admin, item.rent_charge_id, item.prior_charge_status)) {
      return { success: false, error: "Rent was removed, but its status could not be reset." };
    }
  }
  return { success: true };
}
