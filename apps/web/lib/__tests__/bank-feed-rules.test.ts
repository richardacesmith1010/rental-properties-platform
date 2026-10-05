import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRowToken } from "@/lib/bank-feed/fingerprint";
import { answerBankItem, undoBankItem } from "@/app/actions/bank-feed";
import { reverseItemRule } from "@/lib/bank-feed/rules";
import { fakeAdmin, BANK_ID, base, tokenRow } from "./bank-feed-test-admin";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BANK_FEED_SECRET", "s".repeat(32)); });
const RULE_ID = "00000000-0000-4000-8000-000000000010";
const ITEM_ID = "00000000-0000-4000-8000-000000000011";
const HOME_ID = "00000000-0000-4000-8000-000000000012";
const priorRule = { action: "skip", lease_id: null, property_id: null,
  expense_category: null, label: null };
const ownerItem = { id: ITEM_ID, bank_account_id: BANK_ID, matched_by: "owner", kind: "transfer",
  created_record: false, rule_id: RULE_ID, rule_created: true, rule_snapshot: null,
  created_at: "2026-10-05T12:00:00Z", property_id: null, payment_id: null, expense_id: null,
  rent_charge_id: null, prior_charge_status: null };

describe("rule-aware undo", () => {
  it("deletes an owner transfer and its created rule", async () => {
    const admin = fakeAdmin({ ...base, bank_transactions: [ownerItem], bank_rules: [{ id: RULE_ID }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await undoBankItem({ bankTransactionId: ITEM_ID });
    expect(result.success).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(0);
    expect(admin.tables.bank_transactions).toHaveLength(0);
  });
  it("keeps a created rule only for a newer owner answer", async () => {
    const newer = { ...ownerItem, id: "newer", matched_by: "owner", rule_created: false,
      rule_snapshot: priorRule, created_at: "2026-10-06T12:00:00Z" };
    const admin = fakeAdmin({ ...base, bank_transactions: [ownerItem, newer], bank_rules: [{ id: RULE_ID }] });
    expect((await reverseItemRule(admin as never, ownerItem)).success).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(1);
    admin.tables.bank_transactions[1].matched_by = "auto";
    expect((await reverseItemRule(admin as never, ownerItem)).success).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(0);
  });
  it("restores a snapshot and deletes the rule if restoration is rejected", async () => {
    const item = { ...ownerItem, rule_created: false, rule_snapshot: priorRule };
    const rule = { id: RULE_ID, action: "expense", lease_id: null, property_id: HOME_ID,
      expense_category: "mortgage", label: "Mortgage" };
    const admin = fakeAdmin({ ...base, bank_rules: [rule] });
    expect((await reverseItemRule(admin as never, item)).success).toBe(true);
    expect(admin.tables.bank_rules[0]).toMatchObject(priorRule);
    const rejected = fakeAdmin({ ...base, bank_rules: [rule] }, { "bank_rules:update": "failure" });
    expect((await reverseItemRule(rejected as never, item)).success).toBe(true);
    expect(rejected.tables.bank_rules).toHaveLength(0);
  });
  it("deletes a rule with a malformed snapshot", async () => {
    const admin = fakeAdmin({ ...base, bank_rules: [{ id: RULE_ID }] });
    const result = await reverseItemRule(admin as never, { ...ownerItem, rule_created: false,
      rule_snapshot: { ...priorRule, action: "invalid" } });
    expect(result.success).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(0);
  });
  it("stops before deleting a record when rule deletion fails, then retries", async () => {
    const admin = fakeAdmin({ ...base, bank_transactions: [ownerItem], bank_rules: [{ id: RULE_ID }] },
      { "bank_rules:delete": "failure@1" });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await undoBankItem({ bankTransactionId: ITEM_ID })).success).toBe(false);
    expect(admin.tables.bank_transactions).toHaveLength(1);
    expect(admin.writes).toHaveLength(0);
    expect((await undoBankItem({ bankTransactionId: ITEM_ID })).success).toBe(true);
  });
  it("deletes an already recorded owner rent item without touching the payment", async () => {
    const item = { ...ownerItem, kind: "rent", created_record: false, payment_id: "payment",
      rule_created: false, rule_snapshot: priorRule };
    const admin = fakeAdmin({ ...base, bank_transactions: [item], bank_rules: [{ id: RULE_ID,
      action: "rent", lease_id: null, property_id: null, expense_category: null, label: null }],
      payments: [{ id: "payment" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await undoBankItem({ bankTransactionId: ITEM_ID })).success).toBe(true);
    expect(admin.tables.bank_transactions).toHaveLength(0);
    expect(admin.tables.payments).toHaveLength(1);
    expect(admin.tables.bank_rules[0]).toMatchObject(priorRule);
  });
  it("refuses a rule-filed item and a different owner account", async () => {
    const other = { ...ownerItem, id: "00000000-0000-4000-8000-000000000013", bank_account_id: "other" };
    const admin = fakeAdmin({ ...base, bank_transactions: [{ ...ownerItem, matched_by: "rule" }, other],
      bank_rules: [{ id: RULE_ID }], bank_accounts: [...base.bank_accounts,
        { id: "other", owner_account_id: "other-account", nickname: "Other", institution: "other" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await undoBankItem({ bankTransactionId: ITEM_ID })).success).toBe(false);
    expect((await undoBankItem({ bankTransactionId: other.id })).success).toBe(false);
    expect(admin.writes).toHaveLength(0);
  });
});

const billToken = () => createRowToken({ ...tokenRow, direction: "out", amountCents: 103944,
  description: "Transfer To Mortgage" });
const billChoice = { kind: "expense" as const, propertyId: HOME_ID,
  category: "mortgage" as const, label: "Mortgage" };
const home = { id: HOME_ID, owner_account_id: "account", active: true, name: "Home" };
const raceRule = { id: RULE_ID, owner_account_id: "account", bank_account_id: BANK_ID,
  direction: "out", match_text: "TRANSFER TO MORTGAGE", ...priorRule };

describe("answer rule compensation", () => {
  it("restores an overwritten skip rule on undo", async () => {
    const admin = fakeAdmin({ ...base, properties: [home], bank_rules: [raceRule] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const answer = await answerBankItem({ bankAccountId: BANK_ID, token: billToken(), decision: "yes",
      always: true, choice: billChoice });
    expect(answer.success).toBe(true);
    expect(admin.tables.bank_transactions[0]).toMatchObject({ rule_id: RULE_ID, rule_snapshot: priorRule });
    expect((await reverseItemRule(admin as never, { ...ownerItem, rule_created: false,
      rule_snapshot: admin.tables.bank_transactions[0].rule_snapshot })).success).toBe(true);
    expect(admin.tables.bank_rules[0]).toMatchObject(priorRule);
  });
  it("deletes a new rule if bank item metadata cannot be saved", async () => {
    const admin = fakeAdmin({ ...base, properties: [home] }, { "bank_transactions:update": "failure" });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: billToken(), decision: "yes",
      always: true, choice: billChoice });
    expect(result).toMatchObject({ success: true, ruleError: true });
    expect(admin.tables.bank_rules).toHaveLength(0);
    expect(admin.tables.bank_transactions).toHaveLength(1);
  });
  it("snapshots the winning rule after a 23505 insert race", async () => {
    const admin = fakeAdmin({ ...base, properties: [home] }, { "bank_rules:insert": "23505" }, raceRule);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: billToken(), decision: "yes",
      always: true, choice: billChoice });
    expect(result).toMatchObject({ success: true, ruleError: false });
    expect(admin.tables.bank_transactions[0]).toMatchObject({ rule_id: RULE_ID, rule_snapshot: priorRule });
    expect(admin.tables.bank_rules[0]).toMatchObject({ action: "expense" });
  });
  it("deletes a race winner when metadata and restoration both fail", async () => {
    const admin = fakeAdmin({ ...base, properties: [home] }, {
      "bank_rules:insert": "23505", "bank_transactions:update": "failure", "bank_rules:update": "failure@2"
    }, raceRule);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: billToken(), decision: "yes",
      always: true, choice: billChoice });
    expect(result).toMatchObject({ success: true, ruleError: true });
    expect(admin.tables.bank_rules).toHaveLength(0);
  });
});
