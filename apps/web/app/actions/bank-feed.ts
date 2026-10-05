"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { bankFingerprint, createRowToken, verifyRowToken } from "@/lib/bank-feed/fingerprint";
import { classifyRows, isSpecificMatchText, normalizeDescription } from "@/lib/bank-feed/match";
import { fileBankItem, undoFiledItem } from "@/lib/bank-feed/file-item";
import type { BankCharge, BankChoice, BankProperty, BankRow, BankRule, TransferLeg } from "@/lib/bank-feed/types";
import { answerBankItemSchema, createBankAccountSchema, deleteBankAccountSchema,
  importBankRowsSchema, undoBankItemSchema } from "@/lib/validations-bank-feed";
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
async function propertyAllowed(admin: Admin, profileId: string, ownerAccountId: string, propertyId: string) {
  const { data, error } = await admin.from("properties").select("id, owner_account_id")
    .eq("id", propertyId).maybeSingle();
  if (error) { console.error("bank_load_property"); return false; }
  return data?.owner_account_id === ownerAccountId && await canUserAdministerProperty(profileId, propertyId);
}
async function loadMatching(admin: Admin, ownerAccountId: string, bankAccountId: string,
  rows: BankRow[]): Promise<{ rules: BankRule[]; fingerprints: Set<string>; charges: BankCharge[];
    properties: BankProperty[]; legs: TransferLeg[] } | null> {
  const earliest = rows.reduce((date, row) => row.postedOn < date ? row.postedOn : date, rows[0].postedOn);
  const latest = rows.reduce((date, row) => row.postedOn > date ? row.postedOn : date, rows[0].postedOn);
  const from = new Date(Date.parse(earliest + "T00:00:00Z") - 45 * 86_400_000).toISOString().slice(0, 10);
  const after = new Date(Date.parse(latest + "T00:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10);
  const legsThrough = new Date(Date.parse(latest + "T00:00:00Z") + 5 * 86_400_000).toISOString().slice(0, 10);
  const before = new Date(Date.parse(earliest + "T00:00:00Z") - 7 * 86_400_000).toISOString().slice(0, 10);
  const [rulesQuery, propertiesQuery, accountsQuery] = await Promise.all([
    admin.from("bank_rules").select("*").eq("owner_account_id", ownerAccountId),
    admin.from("properties").select("id, name").eq("owner_account_id", ownerAccountId).eq("active", true),
    admin.from("bank_accounts").select("id").eq("owner_account_id", ownerAccountId)
  ]);
  if (rulesQuery.error || propertiesQuery.error || accountsQuery.error) return null;
  const properties = (propertiesQuery.data || []) as BankProperty[];
  const propertyIds = properties.map((item) => item.id);
  const bankIds = (accountsQuery.data || []).map((item) => item.id);
  const [unitsQuery, legsQuery] = await Promise.all([
    propertyIds.length ? admin.from("units").select("id, property_id").in("property_id", propertyIds).eq("active", true)
      : Promise.resolve({ data: [], error: null }), bankIds.length ? admin.from("bank_transactions")
      .select("bank_account_id, posted_on, amount_cents, direction, kind")
      .in("bank_account_id", bankIds).in("kind", ["rent", "transfer"]).gte("posted_on", from).lte("posted_on", legsThrough)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (unitsQuery.error || legsQuery.error) return null;
  const units = unitsQuery.data || [];
  const unitIds = units.map((item) => item.id);
  const leasesQuery = unitIds.length ? await admin.from("leases")
    .select("id, unit_id, tenant_profile_id").in("unit_id", unitIds).eq("active", true)
    : { data: [], error: null };
  if (leasesQuery.error) return null;
  const leases = leasesQuery.data || [];
  const leaseIds = leases.map((item) => item.id);
  const tenantIds = [...new Set(leases.map((item) => item.tenant_profile_id))];
  const [chargesQuery, profilesQuery] = await Promise.all([
    leaseIds.length ? admin.from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status")
      .in("lease_id", leaseIds).is("deleted_at", null).gte("due_date", before).lte("due_date", after)
      : Promise.resolve({ data: [], error: null }), tenantIds.length ? admin.from("profiles").select("id, full_name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (chargesQuery.error || profilesQuery.error) return null;
  const unitMap = new Map(units.map((item) => [item.id, item.property_id]));
  const leaseMap = new Map(leases.map((item) => [item.id, item]));
  const propertyMap = new Map(properties.map((item) => [item.id, item.name]));
  const profileMap = new Map((profilesQuery.data || []).map((item) => [item.id, item.full_name]));
  const charges: BankCharge[] = (chargesQuery.data || []).flatMap((item) => {
    const lease = leaseMap.get(item.lease_id);
    const propertyId = lease ? unitMap.get(lease.unit_id) : null;
    if (!lease || !propertyId) return [];
    return [{ id: item.id, leaseId: item.lease_id, propertyId, propertyName: propertyMap.get(propertyId) || "Home",
      tenantName: profileMap.get(lease.tenant_profile_id) || "Tenant", dueDate: item.due_date,
      amountCents: item.amount_cents, status: item.status as BankCharge["status"] }];
  });
  const fingerprints = new Set<string>();
  for (let start = 0; start < rows.length; start += 100) {
    const batch = rows.slice(start, start + 100).map((item) => item.fingerprint);
    const [filed, skipped] = await Promise.all([
      admin.from("bank_transactions").select("fingerprint").eq("bank_account_id", bankAccountId).in("fingerprint", batch),
      admin.from("bank_skipped_fingerprints").select("fingerprint").eq("bank_account_id", bankAccountId).in("fingerprint", batch)
    ]);
    if (filed.error || skipped.error) return null;
    for (const item of [...(filed.data || []), ...(skipped.data || [])]) fingerprints.add(item.fingerprint);
  }
  return { rules: (rulesQuery.data || []) as BankRule[], properties, charges, fingerprints,
    legs: (legsQuery.data || []).map((item) => ({ bankAccountId: item.bank_account_id,
      postedOn: item.posted_on, amountCents: item.amount_cents, direction: item.direction, kind: item.kind })) as TransferLeg[] };
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
  const counts = { filedCount: 0, transferCount: 0, alreadyCount: 0, skippedByRuleCount: 0, personalCount: 0 };
  const results: Array<{ i: number; status: "filed" | "transfer" | "already" | "skipped" | "ask" | "personal";
    token?: string; suggestion?: ReturnType<typeof classifyRows>[number]["suggestion"];
    ruleable?: boolean; alreadyRecorded?: boolean }> = [];
  const seen = new Map<string, number>();
  const rows: BankRow[] = parsed.data.rows.map((row) => {
    const key = `${row.postedOn}|${row.amountCents}|${row.direction}|${normalizeDescription(row.description)}`;
    const occurrenceIndex = seen.get(key) || 0;
    seen.set(key, occurrenceIndex + 1);
    return { ...row, occurrenceIndex, fingerprint: bankFingerprint({ ...row,
      bankAccountId: bank.id, occurrenceIndex }) };
  });
  const context = await loadMatching(admin, bank.owner_account_id, bank.id, rows);
  if (!context) return safeFailure("bank_import_load");
  const classified = classifyRows({ rows, bankAccountId: bank.id, ...context });
  const chargeMap = new Map(context.charges.map((item) => [item.id, item]));
  const rentChargeIds = [...new Set(classified.flatMap((item) => item.choice?.kind === "rent"
    ? [item.choice.rentChargeId] : []))];
  const linkedQuery = rentChargeIds.length ? await admin.from("bank_transactions")
    .select("rent_charge_id, fingerprint").in("rent_charge_id", rentChargeIds)
    : { data: [], error: null };
  if (linkedQuery.error) return safeFailure("bank_import_linked_rent");
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
      && await propertyAllowed(admin, user.id, bank.owner_account_id, id)] as const));
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
    token: createRowToken({ ...row, bankAccountId: bank.id, profileId: user.id }) });
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const result = classified[index];
    if (result.status === "already") { counts.alreadyCount++; results.push({ i: row.i, status: "already" }); continue; }
    if (result.status === "personal" || result.status === "ask") {
      if (result.status === "personal") counts.personalCount++;
      results.push({ i: row.i, status: result.status, suggestion: result.suggestion,
        ruleable: isSpecificMatchText(normalizeDescription(row.description).slice(0, 200)), token: createRowToken({ ...row,
          bankAccountId: bank.id, profileId: user.id }) });
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
    const filed = await fileBankItem({ admin, userId: user.id, bankAccountId: bank.id,
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
  void logAudit({ userId: user.id, action: "bank_import", entityType: "bank_account", entityId: bank.id,
    metadata: counts });
  revalidatePath("/owner/bank");
  return { success: true, ...counts, results };
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
    const action = parsed.data.decision === "no" ? "skip" : choice?.kind;
    const rule = { owner_account_id: bank.owner_account_id, bank_account_id: bank.id,
      direction: row.direction, match_text: matchText, action,
      lease_id: choice?.kind === "rent" ? validated?.charge?.lease_id : null,
      property_id: choice?.kind === "expense" ? choice.propertyId : null,
      expense_category: choice?.kind === "expense" ? choice.category : null,
      label: choice?.kind === "expense" ? choice.label : null, created_by_profile_id: user.id };
    const existing = await admin.from("bank_rules").select("id").eq("owner_account_id", bank.owner_account_id)
      .eq("bank_account_id", bank.id).eq("direction", row.direction).eq("match_text", rule.match_text).maybeSingle();
    if (existing.error) { console.error("bank_find_rule"); ruleError = true; }
    else {
      const saved = existing.data ? await admin.from("bank_rules").update(rule).eq("id", existing.data.id)
        : await admin.from("bank_rules").insert(rule);
      if (saved.error?.code === "23505") {
        const found = await admin.from("bank_rules").select("id").eq("owner_account_id", bank.owner_account_id)
          .eq("bank_account_id", bank.id).eq("direction", row.direction).eq("match_text", matchText).maybeSingle();
        if (found.error || !found.data) { console.error("bank_find_rule_conflict"); ruleError = true; }
        else {
          const updated = await admin.from("bank_rules").update(rule).eq("id", found.data.id);
          if (updated.error) { console.error("bank_update_rule_conflict"); ruleError = true; }
        }
      } else if (saved.error) { console.error("bank_save_rule"); ruleError = true; }
    }
  }
  void logAudit({ userId: user.id, action: "bank_answer", entityType: "bank_account", entityId: bank.id,
    metadata: { bankTransactionId: itemId || null, decision: parsed.data.decision } });
  revalidatePath("/owner/bank");
  return { success: true, bankTransactionId: itemId, createdRecord, alreadyRecorded,
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
