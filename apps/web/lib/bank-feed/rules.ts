import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { BankChoice, Direction } from "./types";

const snapshotSchema = z.object({
  action: z.enum(["rent", "expense", "transfer", "skip"]),
  lease_id: z.string().uuid().nullable(), property_id: z.string().uuid().nullable(),
  expense_category: z.enum(["mortgage", "insurance", "property_tax", "hoa", "repair",
    "maintenance", "utility", "management_fee", "legal", "other"]).nullable(),
  label: z.string().max(80).nullable()
}).strict();
type Admin = SupabaseClient;
type Snapshot = z.infer<typeof snapshotSchema>;
const fields = "id, action, lease_id, property_id, expense_category, label";
const undoError = { success: false as const, error: "We could not undo this. Try again." };

async function deleteRule(admin: Admin, id: string): Promise<boolean> {
  const { error, count } = await admin.from("bank_rules").delete({ count: "exact" }).eq("id", id);
  if (error || count !== 1) { console.error("bank_delete_rule"); return false; }
  return true;
}
async function restoreRule(admin: Admin, id: string, snapshot: Snapshot): Promise<boolean> {
  const { data, error } = await admin.from("bank_rules").update(snapshot).eq("id", id).select("id");
  if (error || data?.length !== 1) { console.error("bank_restore_rule"); return false; }
  return true;
}
function snapshot(row: Record<string, unknown>): Snapshot | null {
  const parsed = snapshotSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}
export async function saveAnswerRule(input: {
  admin: Admin; ownerAccountId: string; bankAccountId: string; userId: string;
  direction: Direction; matchText: string; choice?: BankChoice; leaseId?: string | null; decision: "yes" | "no"; itemId?: string;
}): Promise<boolean> {
  const { admin, ownerAccountId, bankAccountId, userId, direction, matchText, choice, decision, itemId } = input;
  const rule = { owner_account_id: ownerAccountId, bank_account_id: bankAccountId, direction,
    match_text: matchText, action: decision === "no" ? "skip" : choice?.kind,
    lease_id: choice?.kind === "rent" ? input.leaseId || null : null,
    property_id: choice?.kind === "expense" ? choice.propertyId : null,
    expense_category: choice?.kind === "expense" ? choice.category : null,
    label: choice?.kind === "expense" ? choice.label : null, created_by_profile_id: userId };
  const find = () => admin.from("bank_rules").select(fields).eq("owner_account_id", ownerAccountId)
    .eq("bank_account_id", bankAccountId).eq("direction", direction).eq("match_text", matchText).maybeSingle();
  let existing = await find();
  if (existing.error) { console.error("bank_find_rule"); return false; }
  let created = false;
  let id: string;
  let prior: Snapshot | null = null;
  if (!existing.data) {
    const inserted = await admin.from("bank_rules").insert(rule).select("id").single();
    if (inserted.error?.code === "23505") {
      existing = await find();
      if (existing.error || !existing.data) { console.error("bank_find_rule_conflict"); return false; }
    } else if (inserted.error || !inserted.data) { console.error("bank_insert_rule"); return false; }
    else { created = true; id = inserted.data.id; }
  }
  if (!created) {
    const row = existing.data!;
    prior = snapshot({ action: row.action, lease_id: row.lease_id, property_id: row.property_id,
      expense_category: row.expense_category, label: row.label });
    if (!prior) { console.error("bank_snapshot_rule"); return false; }
    id = row.id;
    const updated = await admin.from("bank_rules").update(rule).eq("id", id).select("id");
    if (updated.error || updated.data?.length !== 1) { console.error("bank_update_rule"); return false; }
  }
  if (!itemId || decision === "no") return true;
  const saved = await admin.from("bank_transactions")
    .update({ rule_id: id!, rule_created: created, rule_snapshot: prior }).eq("id", itemId).select("id");
  if (!saved.error && saved.data?.length === 1) return true;
  console.error("bank_save_rule_reference");
  if (created) await deleteRule(admin, id!);
  else if (!await restoreRule(admin, id!, prior!)) await deleteRule(admin, id!);
  return false;
}
export async function reverseItemRule(admin: Admin, item: {
  rule_id: string | null; rule_created: boolean; rule_snapshot: unknown; created_at: string;
}): Promise<{ success: true } | typeof undoError> {
  if (!item.rule_id) return { success: true };
  if (item.rule_created) {
    const newer = await admin.from("bank_transactions").select("id").eq("rule_id", item.rule_id)
      .eq("matched_by", "owner").not("rule_snapshot", "is", null).gt("created_at", item.created_at).limit(1);
    if (newer.error) { console.error("bank_find_newer_rule_owner"); return undoError; }
    if (newer.data?.length) return { success: true };
    return await deleteRule(admin, item.rule_id) ? { success: true } : undoError;
  }
  if (item.rule_snapshot !== null) {
    const parsed = snapshotSchema.safeParse(item.rule_snapshot);
    if (parsed.success && await restoreRule(admin, item.rule_id, parsed.data)) return { success: true };
    if (!parsed.success) console.error("bank_parse_rule_snapshot");
    return await deleteRule(admin, item.rule_id) ? { success: true } : undoError;
  }
  return { success: true };
}
