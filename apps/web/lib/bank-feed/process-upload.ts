import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFingerprint, createRowToken } from "./fingerprint";
import { classifyRows, isSpecificMatchText, normalizeDescription } from "./match";
import { loadMatching, propertyAllowed } from "./matching-context";
import { fileBankItem } from "./file-item";
import type { BankRow } from "./types";
import type { ParsedBankRow } from "./csv";

type Admin = ReturnType<typeof createAdminClient>;
export async function processUploadRows(input: { admin: Admin; actorProfileId: string;
  bank: { id: string; owner_account_id: string; nickname: string }; rows: Array<ParsedBankRow & { i: number }> }) {
  const { admin, bank } = input;
  const counts = { filedCount: 0, transferCount: 0, alreadyCount: 0, skippedByRuleCount: 0, personalCount: 0 };
  const results: Array<{ i: number; status: "filed" | "transfer" | "already" | "skipped" | "ask" | "personal";
    token?: string; suggestion?: ReturnType<typeof classifyRows>[number]["suggestion"];
    ruleable?: boolean; alreadyRecorded?: boolean }> = [];
  const seen = new Map<string, number>();
  const rows: BankRow[] = input.rows.map((row) => {
    const key = `${row.postedOn}|${row.amountCents}|${row.direction}|${normalizeDescription(row.description)}`;
    const occurrenceIndex = seen.get(key) || 0;
    seen.set(key, occurrenceIndex + 1);
    return { ...row, occurrenceIndex, fingerprint: bankFingerprint({ ...row,
      bankAccountId: bank.id, occurrenceIndex }) };
  });
  const context = await loadMatching(admin, bank.owner_account_id, bank.id, rows);
  if (!context) {
    console.error("bank_import_load");
    return { success: false as const, error: "We could not finish this. Try again." };
  }
  const classified = classifyRows({ rows, bankAccountId: bank.id, ...context });
  const chargeMap = new Map(context.charges.map((item) => [item.id, item]));
  const rentChargeIds = [...new Set(classified.flatMap((item) => item.choice?.kind === "rent"
    ? [item.choice.rentChargeId] : []))];
  const linkedQuery = rentChargeIds.length ? await admin.from("bank_transactions")
    .select("rent_charge_id, fingerprint").in("rent_charge_id", rentChargeIds)
    : { data: [], error: null };
  if (linkedQuery.error) {
    console.error("bank_import_linked_rent");
    return { success: false as const, error: "We could not finish this. Try again." };
  }
  const linkedCharges = new Map<string, Set<string>>();
  for (const item of linkedQuery.data || []) {
    const linked = linkedCharges.get(item.rent_charge_id) || new Set<string>();
    linked.add(item.fingerprint); linkedCharges.set(item.rent_charge_id, linked);
  }
  const targetProperties = [...new Set(classified.flatMap((item) => {
    if (item.choice?.kind === "expense") return [item.choice.propertyId];
    if (item.choice?.kind === "rent") {
      const charge = chargeMap.get(item.choice.rentChargeId);
      return charge ? [charge.propertyId] : [];
    }
    return [];
  }))];
  const permissions = await Promise.all(targetProperties.map(async (id) => [id,
    context.properties.some((property) => property.id === id)
      && await propertyAllowed(admin, input.actorProfileId, bank.owner_account_id, id)] as const));
  const allowedProperties = new Set(permissions.filter((entry) => entry[1]).map((entry) => entry[0]));
  const failPartial = () => ({ success: false as const, error: "Some items were filed. Try again to finish.",
    ...counts, results });
  const askRow = (row: BankRow) => {
    const charge = context.charges.filter((item) => item.status !== "waived" && item.amountCents === row.amountCents
      && Math.abs(Date.parse(item.dueDate) - Date.parse(row.postedOn)) <= 7 * 86_400_000)
      .sort((a, b) => Math.abs(Date.parse(a.dueDate) - Date.parse(row.postedOn))
        - Math.abs(Date.parse(b.dueDate) - Date.parse(row.postedOn)))[0];
    results.push({ i: row.i, status: "ask", suggestion: row.direction === "in" && charge
      ? { kind: "rent", rentChargeId: charge.id, propertyId: charge.propertyId,
        text: `Rent from ${charge.tenantName} · ${charge.propertyName}` } : undefined,
    ruleable: isSpecificMatchText(normalizeDescription(row.description).slice(0, 200)),
    token: createRowToken({ ...row, bankAccountId: bank.id, profileId: input.actorProfileId }) });
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const result = classified[index];
    if (result.status === "already") { counts.alreadyCount++; results.push({ i: row.i, status: "already" }); continue; }
    if (result.status === "personal" || result.status === "ask") {
      if (result.status === "personal") counts.personalCount++;
      results.push({ i: row.i, status: result.status, suggestion: result.suggestion,
        ruleable: isSpecificMatchText(normalizeDescription(row.description).slice(0, 200)), token: createRowToken({ ...row,
          bankAccountId: bank.id, profileId: input.actorProfileId }) });
      continue;
    }
    if (result.rule?.action === "skip") {
      const { error } = await admin.from("bank_skipped_fingerprints").insert({ bank_account_id: bank.id,
        fingerprint: row.fingerprint });
      if (error && error.code !== "23505") return failPartial();
      counts.skippedByRuleCount++; results.push({ i: row.i, status: "skipped" }); continue;
    }
    const choice = result.choice;
    if (!choice) return failPartial();
    const matchedCharge = choice.kind === "rent" ? chargeMap.get(choice.rentChargeId) : undefined;
    const targetProperty = choice.kind === "expense" ? choice.propertyId : matchedCharge?.propertyId;
    if ((targetProperty && !allowedProperties.has(targetProperty))
      || (choice.kind === "rent" && (!matchedCharge || row.direction !== "in"))
      || (choice.kind === "expense" && row.direction !== "out")) { askRow(row); continue; }
    if (choice.kind === "rent" && matchedCharge) {
      const linked = linkedCharges.get(matchedCharge.id);
      if (linked?.size && !linked.has(row.fingerprint)) { askRow(row); continue; }
    }
    const charge = matchedCharge ? { id: matchedCharge.id, lease_id: matchedCharge.leaseId,
      property_id: matchedCharge.propertyId, amount_cents: matchedCharge.amountCents, status: matchedCharge.status } : undefined;
    const filed = await fileBankItem({ admin, userId: input.actorProfileId, bankAccountId: bank.id,
      nickname: bank.nickname, row, matchedBy: result.status === "transfer" ? "auto" : "rule",
      ruleId: result.rule?.id }, choice, charge);
    if (!filed.success) {
      if (filed.already) { counts.alreadyCount++; results.push({ i: row.i, status: "already" }); continue; }
      return failPartial();
    }
    if (choice.kind === "rent") {
      const linked = linkedCharges.get(choice.rentChargeId) || new Set<string>();
      linked.add(row.fingerprint); linkedCharges.set(choice.rentChargeId, linked);
    }
    if (choice.kind === "transfer") counts.transferCount++; else counts.filedCount++;
    results.push({ i: row.i, status: choice.kind === "transfer" ? "transfer" : "filed",
      alreadyRecorded: filed.alreadyRecorded });
  }
  const { error: updateError } = await admin.from("bank_accounts")
    .update({ last_import_at: new Date().toISOString() }).eq("id", bank.id);
  if (updateError) return failPartial();
  return { success: true, ...counts, results };
}
