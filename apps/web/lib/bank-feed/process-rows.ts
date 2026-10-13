import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFingerprint } from "./fingerprint";
import { processUploadRows } from "./process-upload";
import type { ParsedBankRow } from "./csv";
import { classifyRows } from "./match";
import { loadMatching } from "./matching-context";
import type { BankChoice, BankRow, MatchResult } from "./types";

type Admin = ReturnType<typeof createAdminClient>;
export type SyncedRow = BankRow & { externalId: string };
export type SyncBank = { id: string; owner_account_id: string; nickname: string };

export function buildSyncedFilePayload(input: {
  row: SyncedRow; bank: SyncBank; choice: BankChoice; match: MatchResult;
  actorProfileId: string;
}) {
  const { row, bank, choice, match, actorProfileId } = input;
  return {
    ownerAccountId: bank.owner_account_id, bankAccountId: bank.id, externalId: row.externalId,
    fingerprint: row.fingerprint, postedOn: row.postedOn, amountCents: row.amountCents,
    direction: row.direction, description: row.description, nickname: bank.nickname,
    choice, actorProfileId, matchedBy: match.status === "transfer" ? "auto" : "rule",
    ruleId: match.rule?.id ?? null
  };
}

function csvCandidates(bankAccountId: string, row: SyncedRow): string[] {
  return Array.from({ length: 10 }, (_, occurrenceIndex) => bankFingerprint({
    bankAccountId, postedOn: row.postedOn, amountCents: row.amountCents,
    direction: row.direction, description: row.description, occurrenceIndex
  }));
}

async function processSyncedRows(input: {
  admin: Admin; actorProfileId: string | null; bank: SyncBank; rows: SyncedRow[];
  onProgress?: () => Promise<void>;
}) {
  const { admin, bank, rows, actorProfileId } = input;
  if (!rows.length) return;
  const context = await loadMatching(admin, bank.owner_account_id, bank.id, rows);
  if (!context) throw new Error("Bank matching failed.");
  const ids = rows.map((row) => row.externalId);
  const existing = await admin.from("bank_transactions").select("external_id")
    .eq("bank_account_id", bank.id).in("external_id", ids);
  const queued = await admin.from("bank_review_items").select("external_id")
    .eq("bank_account_id", bank.id).in("external_id", ids);
  if (existing.error || queued.error) throw new Error("Bank identity lookup failed.");
  const processedIds = new Set([...(existing.data || []), ...(queued.data || [])].map((row) => row.external_id));
  const candidates = rows.flatMap((row) => csvCandidates(bank.id, row));
  const duplicates = new Set<string>();
  for (let start = 0; start < candidates.length; start += 100) {
    const batch = candidates.slice(start, start + 100);
    const [filed, skipped] = await Promise.all([
      admin.from("bank_transactions").select("fingerprint").eq("bank_account_id", bank.id).in("fingerprint", batch),
      admin.from("bank_skipped_fingerprints").select("fingerprint")
        .eq("bank_account_id", bank.id).in("fingerprint", batch)
    ]);
    if (filed.error || skipped.error) throw new Error("Bank duplicate lookup failed.");
    for (const entry of [...(filed.data || []), ...(skipped.data || [])]) duplicates.add(entry.fingerprint);
  }
  const classified = classifyRows({ rows, bankAccountId: bank.id, ...context });
  const chargeMap = new Map(context.charges.map((charge) => [charge.id, charge]));
  for (const [index, row] of rows.entries()) {
    if (index % 100 === 0) await input.onProgress?.();
    if (processedIds.has(row.externalId)) continue;
    const match = classified[index];
    const possibleDuplicate = csvCandidates(bank.id, row).some((fingerprint) => duplicates.has(fingerprint));
    const choice = match.choice;
    const charge = choice?.kind === "rent" ? chargeMap.get(choice.rentChargeId) : undefined;
    const propertyId = choice?.kind === "expense" ? choice.propertyId : charge?.propertyId;
    const validProperty = !propertyId || context.properties.some((property) => property.id === propertyId);
    if (match.status === "personal" && !possibleDuplicate) continue;
    const shouldQueue = possibleDuplicate || !actorProfileId || !validProperty || match.status === "ask";
    if (shouldQueue) {
      const { error } = await admin.from("bank_review_items").upsert({
        owner_account_id: bank.owner_account_id, bank_account_id: bank.id, external_id: row.externalId,
        fingerprint: row.fingerprint, posted_on: row.postedOn, amount_cents: row.amountCents,
        direction: row.direction, description: row.description.slice(0, 200),
        suggestion: match.suggestion ?? null, possible_duplicate: possibleDuplicate
      }, { onConflict: "bank_account_id,external_id", ignoreDuplicates: true });
      if (error) throw new Error("Bank review queue failed.");
      continue;
    }
    if (match.status === "personal" || match.status === "already") continue;
    if (match.rule?.action === "skip") {
      const { error } = await admin.from("bank_skipped_fingerprints").upsert({
        bank_account_id: bank.id, fingerprint: row.fingerprint
      }, { onConflict: "bank_account_id,fingerprint", ignoreDuplicates: true });
      if (error) throw new Error("Bank skip failed.");
      continue;
    }
    if (!choice) continue;
    const payload = buildSyncedFilePayload({ row, bank, choice, match, actorProfileId });
    const { data, error } = await admin.rpc("file_synced_bank_item", { p: payload });
    if (error) throw new Error("Bank filing failed.");
    if (data === "stale") {
      const { error: queueError } = await admin.from("bank_review_items").upsert({
        owner_account_id: bank.owner_account_id, bank_account_id: bank.id, external_id: row.externalId,
        fingerprint: row.fingerprint, posted_on: row.postedOn, amount_cents: row.amountCents,
        direction: row.direction, description: row.description.slice(0, 200), suggestion: match.suggestion ?? null
      }, { onConflict: "bank_account_id,external_id", ignoreDuplicates: true });
      if (queueError) throw new Error("Bank review queue failed.");
    }
  }
}

type UploadInput = { admin: Admin; actorProfileId: string;
  bank: SyncBank; rows: Array<ParsedBankRow & { i: number }>; source: "upload" };
type SyncInput = { admin: Admin; actorProfileId: string | null; bank: SyncBank; rows: SyncedRow[];
  source: "sync"; onProgress?: () => Promise<void> };
export function processBankRows(input: UploadInput): ReturnType<typeof processUploadRows>;
export function processBankRows(input: SyncInput): Promise<void>;
export async function processBankRows(input: UploadInput | SyncInput) {
  return input.source === "upload" ? processUploadRows(input) : processSyncedRows(input);
}
