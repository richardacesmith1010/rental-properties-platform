"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { bankFingerprint, verifyRowToken } from "@/lib/bank-feed/fingerprint";
import { classifyRows, isSpecificMatchText, normalizeDescription } from "@/lib/bank-feed/match";
import { saveAnswerRule, reverseItemRule } from "@/lib/bank-feed/rules";
import { loadMatching, propertyAllowed } from "@/lib/bank-feed/matching-context";
import { processBankRows } from "@/lib/bank-feed/process-rows";
import { fileBankItem, undoFiledItem } from "@/lib/bank-feed/file-item";
import type { BankChoice, BankRow } from "@/lib/bank-feed/types";
import { answerBankItemSchema, createBankAccountSchema, deleteBankAccountSchema,
  importBankRowsSchema, undoBankItemSchema, queuedBankAnswerSchema } from "@/lib/validations-bank-feed";
type Admin = ReturnType<typeof createAdminClient>;
type Fail = { success: false; error: string };
const ACCESS = "You do not have access to this account.";
const SETUP = "Bank files are not set up yet.";
function safeFailure(operation: string, error = "We could not finish this. Try again."): Fail {
  console.error(operation);
  return { success: false, error };
}
function limit(userId: string, action: string): boolean {
  return checkRateLimit(`bank:${action}:${userId}`, 30, 60_000).allowed;
}
function ready(): boolean {
  return typeof process.env.BANK_FEED_SECRET === "string" && process.env.BANK_FEED_SECRET.length >= 32;
}
async function member(admin: Admin, profileId: string, accountId: string): Promise<boolean> {
  const { data, error } = await admin.from("ownership_account_members").select("profile_id")
    .eq("account_id", accountId).eq("profile_id", profileId).eq("member_role", "owner")
    .eq("active", true).maybeSingle();
  if (error) { console.error("bank_owner_membership"); return false; }
  return !!data;
}
async function account(admin: Admin, profileId: string, bankAccountId: string) {
  const { data, error } = await admin.from("bank_accounts")
    .select("id, owner_account_id, nickname, institution").eq("id", bankAccountId).maybeSingle();
  if (error) console.error("bank_load_account");
  return data && await member(admin, profileId, data.owner_account_id) ? data : null;
}
async function checkedChoice(admin: Admin, profileId: string, ownerAccountId: string, choice: BankChoice, row: BankRow) {
  if (choice.kind === "transfer") return { choice };
  if (choice.kind === "expense") {
    if (row.direction !== "out" || !await propertyAllowed(admin, profileId, ownerAccountId, choice.propertyId)) return null;
    return { choice };
  }
  if (row.direction !== "in") return null;
  const { data: charge, error } = await admin.from("rent_charges")
    .select("id, lease_id, amount_cents, status, deleted_at").eq("id", choice.rentChargeId).maybeSingle();
  if (error || !charge || charge.deleted_at) return null;
  const { data: lease, error: leaseError } = await admin.from("leases").select("id, unit_id, active")
    .eq("id", charge.lease_id).maybeSingle();
  if (leaseError || !lease?.active) return null;
  const { data: unit, error: unitError } = await admin.from("units").select("id, property_id, active")
    .eq("id", lease.unit_id).maybeSingle();
  if (unitError || !unit?.active || !await propertyAllowed(admin, profileId, ownerAccountId, unit.property_id)) return null;
  return { choice, charge: { ...charge, property_id: unit.property_id } };
}
export async function createBankAccount(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "create")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = createBankAccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check the account details." };
  const admin = createAdminClient();
  if (!await member(admin, user.id, parsed.data.ownerAccountId)) return { success: false, error: ACCESS };
  const { data, error } = await admin.from("bank_accounts").insert({ owner_account_id: parsed.data.ownerAccountId,
    institution: parsed.data.institution, nickname: parsed.data.nickname, created_by_profile_id: user.id })
    .select("id").single();
  if (error?.code === "23505") {
    const existing = await admin.from("bank_accounts").select("id").eq("owner_account_id", parsed.data.ownerAccountId)
      .eq("institution", parsed.data.institution).eq("nickname", parsed.data.nickname).maybeSingle();
    if (existing.error || !existing.data) return safeFailure("bank_existing_account");
    return { success: true, bankAccountId: existing.data.id };
  }
  if (error) return safeFailure("bank_create_account");
  revalidatePath("/owner/bank");
  return { success: true, bankAccountId: data.id };
}
export async function importBankRows(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "import")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = importBankRowsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check the bank file and try again." };
  const admin = createAdminClient();
  const bank = await account(admin, user.id, parsed.data.bankAccountId);
  if (!bank) return { success: false, error: ACCESS };
  if (!ready()) return { success: false, error: SETUP };
  const result = await processBankRows({ admin, actorProfileId: user.id, bank,
    rows: parsed.data.rows, source: "upload" });
  if (result.success) {
    void logAudit({ userId: user.id, action: "bank_import", entityType: "bank_account", entityId: bank.id,
      metadata: { filedCount: result.filedCount, transferCount: result.transferCount,
        alreadyCount: result.alreadyCount, skippedByRuleCount: result.skippedByRuleCount,
        personalCount: result.personalCount } });
    revalidatePath("/owner/bank");
  }
  return result;
}
async function propertyName(admin: Admin, id: string): Promise<string> {
  const { data, error } = await admin.from("properties").select("name").eq("id", id).maybeSingle();
  if (error) console.error("bank_recent_property");
  return data?.name || "Home";
}
export async function answerBankItem(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "answer")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = answerBankItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check your answer and try again." };
  if (parsed.data.decision === "no" && parsed.data.choice) {
    return { success: false, error: "Leave the type empty for Not rental." };
  }
  const admin = createAdminClient();
  const bank = await account(admin, user.id, parsed.data.bankAccountId);
  if (!bank) return { success: false, error: ACCESS };
  if (!ready()) return { success: false, error: SETUP };
  const payload = verifyRowToken(parsed.data.token, { bankAccountId: bank.id, profileId: user.id });
  if (!payload) return { success: false, error: "This item has expired. Open the bank file again." };
  const row: BankRow = { i: 0, postedOn: payload.postedOn, amountCents: payload.amountCents,
    direction: payload.direction, description: payload.description, occurrenceIndex: payload.occurrenceIndex,
    fingerprint: bankFingerprint(payload) };
  const [filedQuery, skippedQuery] = await Promise.all([
    admin.from("bank_transactions").select("id").eq("bank_account_id", bank.id)
      .eq("fingerprint", row.fingerprint).maybeSingle(),
    admin.from("bank_skipped_fingerprints").select("fingerprint").eq("bank_account_id", bank.id)
      .eq("fingerprint", row.fingerprint).maybeSingle()
  ]);
  if (filedQuery.error || skippedQuery.error) return safeFailure("bank_answer_existing");
  if (filedQuery.data || skippedQuery.data) return { success: true, already: true };
  let choice: BankChoice | undefined = parsed.data.choice;
  if (parsed.data.decision === "yes" && !choice) {
    const context = await loadMatching(admin, bank.owner_account_id, bank.id, [row]);
    if (!context) return safeFailure("bank_answer_load");
    const fresh = classifyRows({ rows: [row], bankAccountId: bank.id, ...context })[0];
    choice = fresh.choice;
    const suggested = fresh.suggestion;
    if (suggested?.kind === "rent") choice = { kind: "rent", rentChargeId: suggested.rentChargeId };
    else if (suggested?.kind === "expense" && suggested.propertyId) {
      choice = { kind: "expense", propertyId: suggested.propertyId,
        category: suggested.category, label: suggested.label };
    } else if (suggested?.kind === "transfer") choice = { kind: "transfer" };
  }
  if (parsed.data.decision === "yes" && !choice) {
    return { success: false, error: "Pick a home and type first." };
  }
  if (choice && ((choice.kind === "rent" && row.direction !== "in")
    || (choice.kind === "expense" && row.direction !== "out"))) {
    return { success: false, error: `This doesn't fit money going ${row.direction}.` };
  }
  const validated = choice ? await checkedChoice(admin, user.id, bank.owner_account_id, choice, row) : null;
  if (choice && !validated) return { success: false, error: ACCESS };
  const matchText = normalizeDescription(row.description).slice(0, 200);
  const ruleable = isSpecificMatchText(matchText);
  let itemId: string | undefined;
  let createdRecord = false;
  let alreadyRecorded = false;
  let ruleError = false;
  if (parsed.data.decision === "no") {
    const { error } = await admin.from("bank_skipped_fingerprints").insert({
      bank_account_id: bank.id, fingerprint: row.fingerprint
    });
    if (error?.code === "23505") return { success: true, already: true };
    if (error) return safeFailure("bank_skip_item");
  } else if (choice && validated) {
    const filed = await fileBankItem({ admin, userId: user.id, bankAccountId: bank.id,
      nickname: bank.nickname, row, matchedBy: "owner" }, choice, validated.charge);
    if (!filed.success) return filed.already ? { success: true, already: true } : filed;
    itemId = filed.id;
    createdRecord = filed.createdRecord;
    alreadyRecorded = filed.alreadyRecorded || false;
  }
  if (parsed.data.always && ruleable) {
    ruleError = !await saveAnswerRule({ admin, ownerAccountId: bank.owner_account_id,
      bankAccountId: bank.id, userId: user.id, direction: row.direction, matchText,
      choice, leaseId: validated?.charge?.lease_id, decision: parsed.data.decision, itemId });
  }
  void logAudit({ userId: user.id, action: "bank_answer", entityType: "bank_account", entityId: bank.id,
    metadata: { bankTransactionId: itemId || null, decision: parsed.data.decision } });
  revalidatePath("/owner/bank");
  const recentItem = itemId && choice ? { id: itemId, postedOn: row.postedOn,
    description: row.description, amountCents: row.amountCents, direction: row.direction,
    kind: choice.kind, propertyName: choice.kind === "transfer" ? "—" :
      choice.kind === "expense" ? await propertyName(admin, choice.propertyId) :
        await propertyName(admin, validated?.charge?.property_id || "") } : undefined;
  return { success: true, bankTransactionId: itemId, recentItem, createdRecord, alreadyRecorded,
    ruleSkipped: parsed.data.always && !ruleable, ruleError };
}
export async function undoBankItem(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "undo")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = undoBankItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "We could not find this item." };
  const admin = createAdminClient();
  const { data: item, error } = await admin.from("bank_transactions").select("*")
    .eq("id", parsed.data.bankTransactionId).maybeSingle();
  if (error || !item) return { success: false, error: "We could not find this item." };
  const bank = await account(admin, user.id, item.bank_account_id);
  if (!bank) return { success: false, error: ACCESS };
  if (item.property_id && !await propertyAllowed(admin, user.id, bank.owner_account_id, item.property_id)) {
    return { success: false, error: ACCESS };
  }
  if (item.matched_by !== "owner" && !item.bank_change) {
    return { success: false, error: "This item cannot be undone here." };
  }
  const ruleResult = await reverseItemRule(admin, item);
  if (!ruleResult.success) return ruleResult;
  const result = await undoFiledItem(admin, item);
  if (!result.success) return result;
  void logAudit({ userId: user.id, action: "bank_undo", entityType: "bank_account", entityId: bank.id,
    metadata: { bankTransactionId: item.id } });
  revalidatePath("/owner/bank");
  return { success: true };
}
export async function deleteBankAccount(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "delete")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = deleteBankAccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "We could not find this account." };
  const admin = createAdminClient();
  const bank = await account(admin, user.id, parsed.data.bankAccountId);
  if (!bank) return { success: false, error: ACCESS };
  const { error, count } = await admin.from("bank_accounts").delete({ count: "exact" }).eq("id", bank.id);
  if (error || count !== 1) return safeFailure("bank_delete_account");
  void logAudit({ userId: user.id, action: "bank_account_delete", entityType: "bank_account", entityId: bank.id });
  revalidatePath("/owner/bank");
  return { success: true };
}

export async function answerQueuedBankItem(input: unknown) {
  const { user } = await requireAuth("owner");
  if (!limit(user.id, "answer-queued")) return { success: false, error: "Too many tries. Try again soon." };
  const parsed = queuedBankAnswerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Check your answer and try again." };
  if (parsed.data.decision === "no" && parsed.data.choice) {
    return { success: false, error: "Leave the type empty for Not rental." };
  }
  const admin = createAdminClient();
  const { data: item, error } = await admin.from("bank_review_items").select("*")
    .eq("id", parsed.data.itemId).maybeSingle();
  if (error || !item) return { success: false, error: "This item changed. Refresh to see it." };
  const bank = await account(admin, user.id, item.bank_account_id);
  if (!bank || bank.owner_account_id !== item.owner_account_id) return { success: false, error: ACCESS };
  const row: BankRow = { i: 0, postedOn: item.posted_on, amountCents: item.amount_cents,
    direction: item.direction, description: item.description, fingerprint: item.fingerprint, occurrenceIndex: 0 };
  if (parsed.data.decision === "yes" && !parsed.data.choice) {
    return { success: false, error: "Pick a home and type first." };
  }
  const validated = parsed.data.choice
    ? await checkedChoice(admin, user.id, item.owner_account_id, parsed.data.choice, row) : null;
  if (parsed.data.choice && !validated) return { success: false, error: ACCESS };
  const resolved = await admin.rpc("resolve_bank_review_item", {
    p_item_id: item.id, p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_decision: parsed.data.decision, p_choice: parsed.data.choice ?? null,
    p_actor_profile_id: user.id
  });
  if (resolved.error) return safeFailure("bank_resolve_review");
  if (resolved.data === "conflict") return { success: false, error: "This item changed. Refresh to see it." };
  if (resolved.data === "stale") {
    return { success: false, error: "This rent was already recorded or changed. Check the Rent page." };
  }
  if (resolved.data === "already") return { success: true, message: "This was already filed." };
  if (resolved.data !== "filed" && resolved.data !== "skipped") return safeFailure("bank_resolve_unknown");
  let ruleWarning = false;
  const matchText = normalizeDescription(row.description).slice(0, 200);
  if (parsed.data.always && isSpecificMatchText(matchText)) {
    const filedItem = resolved.data === "filed" ? await admin.from("bank_transactions").select("id")
      .eq("bank_account_id", bank.id).eq("external_id", item.external_id).maybeSingle() : null;
    if (filedItem?.error) console.error("bank_resolved_item_lookup");
    ruleWarning = !!filedItem?.error || !await saveAnswerRule({ admin, ownerAccountId: bank.owner_account_id,
      bankAccountId: bank.id, userId: user.id, direction: row.direction, matchText,
      choice: parsed.data.choice, leaseId: validated?.charge?.lease_id,
      decision: parsed.data.decision, itemId: filedItem?.data?.id });
  }
  revalidatePath("/owner/bank");
  revalidatePath("/owner");
  return { success: true, ruleWarning,
    message: ruleWarning ? "Saved. The Always rule didn't save. Try again from Rules." : undefined };
}

export async function keepBankChange(input: unknown) {
  const { user } = await requireAuth("owner");
  const parsed = undoBankItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "We could not find this item." };
  const admin = createAdminClient();
  const found = await admin.from("bank_transactions").select("id,bank_account_id,property_id")
    .eq("id", parsed.data.bankTransactionId).maybeSingle();
  if (found.error || !found.data) return { success: false, error: "We could not find this item." };
  const bank = await account(admin, user.id, found.data.bank_account_id);
  if (!bank || (found.data.property_id
    && !await propertyAllowed(admin, user.id, bank.owner_account_id, found.data.property_id))) {
    return { success: false, error: ACCESS };
  }
  const update = await admin.from("bank_transactions").update({ bank_change: null, bank_change_at: null })
    .eq("id", found.data.id);
  if (update.error) return safeFailure("bank_keep_change");
  revalidatePath("/owner/bank");
  return { success: true };
}
