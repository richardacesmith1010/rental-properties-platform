import { describe, expect, it, vi } from "vitest";
import { buildSyncedFilePayload, type SyncedRow } from "@/lib/bank-feed/process-rows";
import { fileBankItem } from "@/lib/bank-feed/file-item";
import { fakeAdmin } from "./bank-feed-test-admin";
import type { BankChoice, MatchResult } from "@/lib/bank-feed/types";

vi.mock("server-only", () => ({}));
const bank = { id: "bank", owner_account_id: "owner", nickname: "Checking" };
const longDescription = `Solar payment ${"X".repeat(90)}`;
const match: MatchResult = { i: 0, status: "auto", rule: { id: "rule", bank_account_id: "bank",
  direction: "out", match_text: "SOLAR", action: "expense", lease_id: null, property_id: "home",
  expense_category: "utility", label: "Solar", created_at: "2026-10-01" } };
const row = (direction: "in" | "out", description = longDescription): SyncedRow => ({
  i: 0, postedOn: "2026-10-02", amountCents: 235000, direction, description, occurrenceIndex: 0,
  fingerprint: "a".repeat(64), externalId: "plaid-transaction"
});
const charge = { id: "charge", lease_id: "lease", property_id: "home", amount_cents: 235000, status: "pending" };

async function compare(choice: BankChoice, bankRow: SyncedRow, status?: "pending" | "paid", transfer = false) {
  const admin = fakeAdmin({ bank_transactions: [], property_expenses: [], payments: status === "paid"
    ? [{ id: "existing-payment", rent_charge_id: "charge", reversed_at: null }] : [],
    rent_charges: status ? [{ ...charge, status }] : [] });
  const result = await fileBankItem({ admin: admin as never, userId: "owner", bankAccountId: bank.id,
    nickname: bank.nickname, row: bankRow, matchedBy: transfer ? "auto" : "rule", ruleId: transfer ? null : "rule" },
  choice, status ? { ...charge, status } : undefined);
  expect(result.success).toBe(true);
  const payload = buildSyncedFilePayload({ row: bankRow, bank, choice,
    match: transfer ? { i: 0, status: "transfer", choice } : match, actorProfileId: "owner" });
  const filed = admin.tables.bank_transactions[0];
  expect(payload).toMatchObject({ amountCents: filed.amount_cents, postedOn: filed.posted_on,
    description: filed.description, matchedBy: filed.matched_by, ruleId: filed.rule_id, nickname: "Checking" });
  if (choice.kind === "expense") {
    expect(payload.choice).toMatchObject({ category: admin.tables.property_expenses[0].category,
      label: choice.label });
    expect(admin.tables.property_expenses[0]).toMatchObject({
      description: `${choice.label} · ${bankRow.description.slice(0, 80)}`,
      amount_cents: payload.amountCents, expense_date: payload.postedOn });
  }
  if (choice.kind === "rent") {
    expect(payload.choice).toMatchObject({ rentChargeId: filed.rent_charge_id });
    expect(filed.created_record).toBe(status === "pending");
    if (status === "pending") expect(admin.tables.payments[0]).toMatchObject({ amount_cents: payload.amountCents,
      reference_note: `From bank: ${payload.nickname}` });
    else expect(admin.tables.payments).toHaveLength(1);
  }
  if (choice.kind === "transfer") expect(filed).toMatchObject({ kind: "transfer", created_record: false });
}

describe("Sprint 224b synced filing parity", () => {
  it("3c expense payload matches fileBankItem fields", async () => {
    await compare({ kind: "expense", propertyId: "home", category: "utility", label: "Solar" }, row("out"));
  });
  it("3c pending rent payload matches fileBankItem fields", async () => {
    await compare({ kind: "rent", rentChargeId: "charge" }, row("in", "Rent from tenant"), "pending");
  });
  it("3c paid rent payload matches fileBankItem fields", async () => {
    await compare({ kind: "rent", rentChargeId: "charge" }, row("in", "Rent from tenant"), "paid");
  });
  it("3c transfer payload matches fileBankItem fields", async () => {
    await compare({ kind: "transfer" }, row("out", "Transfer to savings"), undefined, true);
  });
});
