import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRowToken } from "@/lib/bank-feed/fingerprint";
import { createBankAccount, answerBankItem, importBankRows } from "@/app/actions/bank-feed";
import { fileBankItem, undoFiledItem } from "@/lib/bank-feed/file-item";
import { answerBankItemSchema, bankChoiceSchema, createBankAccountSchema,
  deleteBankAccountSchema, importBankRowsSchema, undoBankItemSchema } from "@/lib/validations-bank-feed";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { fakeAdmin, BANK_ID, base, tokenRow } from "./bank-feed-test-admin";
const fileRow = { i: 0, postedOn: "2026-10-02", amountCents: 235000, direction: "in" as const,
  description: "DIRECT DEPOSIT JANE TENANT", occurrenceIndex: 0, fingerprint: "a".repeat(64) };
const charge = { id: "charge", lease_id: "lease", property_id: "home", amount_cents: 235000, status: "pending" };
const ctx = (admin: ReturnType<typeof fakeAdmin>) => ({ admin: admin as never, userId: "owner",
  bankAccountId: "bank", nickname: "Checking", row: fileRow, matchedBy: "owner" as const });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BANK_FEED_SECRET", "s".repeat(32)); });
describe("bank input validation", () => {
  it("checks account creation", () => {
    expect(createBankAccountSchema.safeParse({ ownerAccountId: BANK_ID,
      institution: "fidelity", nickname: "Checking" }).success).toBe(true);
    expect(createBankAccountSchema.safeParse({ ownerAccountId: BANK_ID, institution: "fidelity", nickname: "" }).success).toBe(false);
  });
  it("limits rows and preserves their index order", () => {
    const row = { i: 0, postedOn: "2026-10-05", amountCents: 100, direction: "in", description: "Deposit" };
    expect(importBankRowsSchema.safeParse({ bankAccountId: BANK_ID, rows: [row] }).success).toBe(true);
    expect(importBankRowsSchema.safeParse({ bankAccountId: BANK_ID, rows: [{ ...row, i: 1 }] }).success).toBe(false);
    expect(importBankRowsSchema.safeParse({ bankAccountId: BANK_ID, rows: [{ ...row, amountCents: 0 }] }).success).toBe(false);
  });
  it("checks every answer choice and action id", () => {
    expect(bankChoiceSchema.safeParse({ kind: "expense", propertyId: BANK_ID, category: "solar", label: "Solar" }).success).toBe(false);
    expect(bankChoiceSchema.safeParse({ kind: "transfer" }).success).toBe(true);
    expect(answerBankItemSchema.safeParse({ bankAccountId: BANK_ID, token: "a".repeat(10),
      decision: "yes", always: false }).success).toBe(true);
    expect(answerBankItemSchema.safeParse({ bankAccountId: BANK_ID, token: "short", decision: "yes", always: false }).success).toBe(false);
    expect(undoBankItemSchema.safeParse({ bankTransactionId: BANK_ID }).success).toBe(true);
    expect(deleteBankAccountSchema.safeParse({ bankAccountId: "not-an-id" }).success).toBe(false);
  });
});
describe("bank actions and filing", () => {
  it("rejects account creation by a non-owner without a write", async () => {
    const admin = fakeAdmin({ ...base, ownership_account_members: [] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await createBankAccount({ ownerAccountId: "00000000-0000-4000-8000-000000000001",
      institution: "fidelity", nickname: "My bank" });
    expect(result).toEqual({ success: false, error: "You do not have access to this account." });
    expect(admin.writes).toHaveLength(0);
  });
  it("rejects an import when the owner is not a member", async () => {
    const admin = fakeAdmin({ ...base, ownership_account_members: [] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await importBankRows({ bankAccountId: BANK_ID, rows: [{ i: 0, postedOn: "2026-10-05", amountCents: 100,
        direction: "out", description: "Payment to xfinity" }] });
    expect(result).toEqual({ success: false, error: "You do not have access to this account." });
    expect(admin.writes).toHaveLength(0);
  });
  it("rejects a changed token and does not write", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const token = createRowToken(tokenRow);
    const [body, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()),
      amountCents: 1 })).toString("base64url");
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: `${changed}.${signature}`, decision: "no", always: false });
    expect(result.success).toBe(false);
    expect(result.error).toContain("expired");
    expect(admin.writes).toHaveLength(0);
  });
  it("rejects tokens for another account, another owner, or an old file", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const tokens = [createRowToken({ ...tokenRow, bankAccountId: "other" }), createRowToken({ ...tokenRow, profileId: "other" }),
      createRowToken(tokenRow, Date.now() - 25 * 60 * 60 * 1000)];
    for (const token of tokens) {
      const result = await answerBankItem({ bankAccountId: BANK_ID, token, decision: "no", always: false });
      expect(result.success).toBe(false);
    }
    expect(admin.writes).toHaveLength(0);
  });
  it("a no answer saves only the keyed skip value", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const token = createRowToken(tokenRow);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token, decision: "no", always: false });
    expect(result.success).toBe(true);
    expect(admin.writes.map((item) => item.table)).toEqual(["bank_skipped_fingerprints"]);
    expect(JSON.stringify(admin.writes)).not.toContain("ACH CREDIT");
    expect(JSON.stringify(vi.mocked(logAudit).mock.calls)).not.toContain("ACH CREDIT");
    expect(JSON.stringify(vi.mocked(logAudit).mock.calls)).not.toContain("235000");
    expect(JSON.stringify(vi.mocked(logAudit).mock.calls)).not.toContain(token);
  });
  it("rejects a no answer that includes a target", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: createRowToken(tokenRow), decision: "no", always: true,
      choice: { kind: "rent", rentChargeId: BANK_ID } });
    expect(result.success).toBe(false);
    expect(admin.writes).toHaveLength(0);
  });
  it("explains a wrong direction choice", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: createRowToken(tokenRow), decision: "yes", always: false,
      choice: { kind: "expense", propertyId: BANK_ID, category: "other", label: "Bill" } });
    expect(result).toEqual({ success: false, error: "This doesn't fit money going in." });
    expect(admin.writes).toHaveLength(0);
  });
  it("replays a skipped item as already and never stores a personal row", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const rows = [{ i: 0, postedOn: "2026-10-05", amountCents: 8181, direction: "out" as const, description: "Payment to xfinity" }];
    const first = await importBankRows({ bankAccountId: BANK_ID, rows });
    expect(first.success).toBe(true);
    if (!("results" in first)) throw new Error("Expected file results");
    expect(first.results?.[0].status).toBe("personal");
    expect(admin.tables.bank_transactions).toHaveLength(0);
    const token = first.results?.[0].token;
    expect(token).toBeTruthy();
    await answerBankItem({ bankAccountId: BANK_ID, token, decision: "no", always: false });
    const second = await importBankRows({ bankAccountId: BANK_ID, rows });
    if (!("results" in second)) throw new Error("Expected file results");
    expect(second.results?.[0].status).toBe("already");
    expect(admin.tables.bank_transactions).toHaveLength(0);
  });
  it("returns a rent question without saving the bank row", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "home", owner_account_id: "account", name: "Home", active: true }],
      units: [{ id: "unit", property_id: "home", active: true }],
      leases: [{ id: "lease", unit_id: "unit", tenant_profile_id: "tenant", active: true }],
      profiles: [{ id: "tenant", full_name: "Jane Tenant" }], rent_charges: [{ id: "charge", lease_id: "lease", due_date: "2026-11-01",
        amount_cents: 235000, status: "pending", deleted_at: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await importBankRows({ bankAccountId: BANK_ID, rows: [{ i: 0, postedOn: "2026-11-02", amountCents: 235000,
        direction: "in", description: "DIRECT DEPOSIT JANE TENANT" }] });
    expect(result.success).toBe(true);
    expect("results" in result && result.results?.[0].status).toBe("ask");
    expect(admin.tables.bank_transactions).toHaveLength(0);
    expect(admin.tables.payments || []).toHaveLength(0);
  });
  it("asks about a bill when its rule points to an inactive home", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "home", owner_account_id: "account", name: "Home", active: false }],
      bank_rules: [{ id: "rule", owner_account_id: "account", bank_account_id: BANK_ID, direction: "out",
        match_text: "TRANSFER TO MORTGAGE", action: "expense", property_id: "home",
        expense_category: "mortgage", label: "Mortgage", created_at: "2026-01-01" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await importBankRows({ bankAccountId: BANK_ID, rows: [{ i: 0, postedOn: "2026-10-01", amountCents: 103944,
        direction: "out", description: "Transfer To Mortgage" }] });
    expect(result.success).toBe(true);
    expect("results" in result && result.results?.[0].status).toBe("ask");
    expect(admin.tables.property_expenses || []).toHaveLength(0);
  });
  it("loads an incoming transfer leg five days after the outgoing file row", async () => {
    const admin = fakeAdmin({ ...base, bank_accounts: [...base.bank_accounts,
      { id: "second", owner_account_id: "account", nickname: "Savings", institution: "other" }],
      bank_transactions: [
        { id: "rent", bank_account_id: BANK_ID, posted_on: "2026-11-01",
          amount_cents: 235000, direction: "in", kind: "rent" },
        { id: "incoming", bank_account_id: "second", posted_on: "2026-11-07",
          amount_cents: 235000, direction: "in", kind: "transfer" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await importBankRows({ bankAccountId: BANK_ID,
      rows: [{ i: 0, postedOn: "2026-11-02", amountCents: 235000,
        direction: "out", description: "Electronic Funds Transfer Paid" }] });
    expect(result.success).toBe(true);
    expect("results" in result && result.results?.[0].status).toBe("transfer");
  });
  it("files the first rule matched rent deposit and asks about the second", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "home", owner_account_id: "account", name: "Home", active: true }],
      units: [{ id: "unit", property_id: "home", active: true }],
      leases: [{ id: "lease", unit_id: "unit", tenant_profile_id: "tenant", active: true }],
      profiles: [{ id: "tenant", full_name: "Jane Tenant" }], rent_charges: [{ id: "charge", lease_id: "lease", due_date: "2026-11-01",
        amount_cents: 235000, status: "pending", deleted_at: null }],
      bank_rules: [{ id: "rule", owner_account_id: "account", bank_account_id: BANK_ID, direction: "in",
        match_text: "DIRECT DEPOSIT JANE TENANT", action: "rent", lease_id: "lease", created_at: "2026-01-01" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await importBankRows({ bankAccountId: BANK_ID, rows: [0, 1].map((i) => ({ i, postedOn: "2026-11-02", amountCents: 235000,
        direction: "in", description: "DIRECT DEPOSIT JANE TENANT" })) });
    expect(result.success).toBe(true);
    expect("results" in result && result.results?.map((item) => item.status)).toEqual(["filed", "ask"]);
    expect("results" in result && result.results?.[1].suggestion?.kind).toBe("rent");
    expect(admin.tables.payments).toHaveLength(1);
  });
  it("reports two filed rows after the third fails and files the rest on retry", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "home", owner_account_id: "account",
      name: "Home", active: true }], bank_rules: [{ id: "rule", owner_account_id: "account",
      bank_account_id: BANK_ID, direction: "out", match_text: "TRANSFER TO MORTGAGE",
      action: "expense", property_id: "home", expense_category: "mortgage", label: "Mortgage",
      lease_id: null, created_at: "2026-01-01" }] }, { "bank_transactions:insert": "failure@3" });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const rows = Array.from({ length: 5 }, (_, i) => ({ i, postedOn: `2026-10-0${i + 1}`,
      amountCents: 103944, direction: "out" as const, description: "Transfer To Mortgage" }));
    const first = await importBankRows({ bankAccountId: BANK_ID, rows });
    expect(first.success).toBe(false);
    expect("filedCount" in first && first.filedCount).toBe(2);
    expect(admin.tables.bank_transactions).toHaveLength(2);
    const retry = await importBankRows({ bankAccountId: BANK_ID, rows });
    expect(retry.success).toBe(true);
    expect("filedCount" in retry && retry.filedCount).toBe(3);
    expect("alreadyCount" in retry && retry.alreadyCount).toBe(2);
    expect(admin.tables.bank_transactions).toHaveLength(5);
  });
  it("creates one rule for a specific bill payee", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "00000000-0000-4000-8000-000000000002",
      owner_account_id: "account", active: true, name: "Home" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const token = createRowToken({ ...tokenRow, direction: "out", amountCents: 103944, description: "Transfer To Mortgage" });
    const result = await answerBankItem({ bankAccountId: BANK_ID, token, decision: "yes", always: true,
      choice: { kind: "expense", propertyId: "00000000-0000-4000-8000-000000000002", category: "mortgage", label: "Mortgage" } });
    expect(result.success).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(1);
    expect(admin.tables.bank_rules[0]).toMatchObject({ match_text: "TRANSFER TO MORTGAGE", action: "expense" });
    expect(admin.tables.bank_transactions[0]).toMatchObject({
      rule_id: admin.tables.bank_rules[0].id, rule_created: true, rule_snapshot: null });
    expect(admin.tables.property_expenses).toHaveLength(1);
    const replay = await answerBankItem({ bankAccountId: BANK_ID, token, decision: "yes", always: true,
      choice: { kind: "expense", propertyId: "00000000-0000-4000-8000-000000000002", category: "mortgage", label: "Mortgage" } });
    expect(replay).toMatchObject({ success: true, already: true });
    expect(admin.tables.bank_rules).toHaveLength(1);
    expect(admin.tables.property_expenses).toHaveLength(1);
  });
  it("keeps the filed item visible when saving its rule fails", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "00000000-0000-4000-8000-000000000002",
      owner_account_id: "account", active: true, name: "Home" }] }, { "bank_rules:insert": "failure" });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID,
      token: createRowToken({ ...tokenRow, direction: "out", amountCents: 103944,
        description: "Transfer To Mortgage" }), decision: "yes", always: true,
      choice: { kind: "expense", propertyId: "00000000-0000-4000-8000-000000000002", category: "mortgage", label: "Mortgage" } });
    expect(result.success && result.ruleError).toBe(true);
    expect("bankTransactionId" in result && result.bankTransactionId).toBeTruthy();
    expect(admin.tables.property_expenses).toHaveLength(1);
  });
  it("does not create a rule for generic credit text", async () => {
    const admin = fakeAdmin(base);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: createRowToken(tokenRow), decision: "no", always: true });
    expect(result.success && result.ruleSkipped).toBe(true);
    expect(admin.tables.bank_rules).toHaveLength(0);
  });
  it("rejects a home from another owner account without writing", async () => {
    const admin = fakeAdmin({ ...base, properties: [{ id: "00000000-0000-4000-8000-000000000003",
      owner_account_id: "other", active: true, name: "Other Home" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID,
      token: createRowToken({ ...tokenRow, direction: "out", description: "Transfer To Mortgage" }),
      decision: "yes", always: false, choice: { kind: "expense",
        propertyId: "00000000-0000-4000-8000-000000000003", category: "mortgage", label: "Mortgage" } });
    expect(result).toEqual({ success: false, error: "You do not have access to this account." });
    expect(admin.writes).toHaveLength(0);
  });
  it("rejects rent from a lease on another owner account", async () => {
    const chargeId = "00000000-0000-4000-8000-000000000004";
    const admin = fakeAdmin({ ...base, rent_charges: [{ id: chargeId, lease_id: "lease", amount_cents: 235000,
        status: "pending", deleted_at: null }], leases: [{ id: "lease", unit_id: "unit", active: true }],
      units: [{ id: "unit", property_id: "other-home", active: true }], properties: [{ id: "other-home", owner_account_id: "another" }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerBankItem({ bankAccountId: BANK_ID, token: createRowToken(tokenRow),
      decision: "yes", always: false, choice: { kind: "rent", rentChargeId: chargeId } });
    expect(result).toEqual({ success: false, error: "You do not have access to this account." });
    expect(admin.writes).toHaveLength(0);
  });
  it("claims rent before creating one payment", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge }], payments: [], bank_transactions: [] });
    const first = await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, charge);
    const second = await fileBankItem({ ...ctx(admin), row: { ...fileRow, fingerprint: "b".repeat(64) } },
      { kind: "rent", rentChargeId: "charge" }, charge);
    expect(first.success).toBe(true);
    expect(second).toEqual({ success: false, error: "This rent was just recorded. Refresh to see it." });
    expect(admin.tables.payments).toHaveLength(1);
    expect(admin.tables.payments[0]).toMatchObject({ method: "ach", paid_at: "2026-10-02T12:00:00.000Z" });
  });
  it("restores a late charge when payment creation fails", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge, status: "late" }], payments: [], bank_transactions: [] },
      { "payments:insert": "failure" });
    const result = await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, { ...charge, status: "late" });
    expect(result.success).toBe(false);
    expect(admin.tables.rent_charges[0].status).toBe("late");
    expect(admin.tables.payments).toHaveLength(0);
  });
  it("keeps paid when another payment appears during compensation", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge }],
      payments: [{ id: "another", rent_charge_id: "charge", reversed_at: null }], bank_transactions: [] },
      { "payments:insert": "failure" });
    await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, charge);
    expect(admin.tables.rent_charges[0].status).toBe("paid");
  });
  it("removes the payment and restores pending after a bank item failure", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge }], payments: [], bank_transactions: [] },
      { "bank_transactions:insert": "failure" });
    await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, charge);
    expect(admin.tables.payments).toHaveLength(0);
    expect(admin.tables.rent_charges[0].status).toBe("pending");
  });
  it("links paid rent without another payment and rejects a mismatch", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge, status: "paid" }], payments: [], bank_transactions: [] });
    const paid = await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, { ...charge, status: "paid" });
    expect(paid.success && paid.createdRecord).toBe(false);
    expect(paid.success && paid.alreadyRecorded).toBe(true);
    expect(admin.tables.payments).toHaveLength(0);
    const mismatch = await fileBankItem(ctx(admin), { kind: "rent", rentChargeId: "charge" }, { ...charge, amount_cents: 123 });
    expect(mismatch.success).toBe(false);
    expect(admin.tables.payments).toHaveLength(0);
  });
  it("undo restores the prior late state", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge, status: "paid" }],
      payments: [{ id: "payment", rent_charge_id: "charge", reversed_at: null }] });
    const result = await undoFiledItem(admin as never, { id: "item", kind: "rent", created_record: true,
      payment_id: "payment", expense_id: null, rent_charge_id: "charge", prior_charge_status: "late" });
    expect(result.success).toBe(true);
    expect(admin.tables.rent_charges[0].status).toBe("late");
  });
  it("undo leaves rent waived after the payment is deleted", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge, status: "waived" }],
      payments: [{ id: "payment", rent_charge_id: "charge", reversed_at: null }] });
    const result = await undoFiledItem(admin as never, { id: "item", kind: "rent", created_record: true,
      payment_id: "payment", expense_id: null, rent_charge_id: "charge", prior_charge_status: "pending" });
    expect(result).toEqual({ success: true });
    expect(admin.tables.payments).toHaveLength(0);
    expect(admin.tables.rent_charges[0].status).toBe("waived");
  });
  it("does not restore rent when another payment remains", async () => {
    const admin = fakeAdmin({ rent_charges: [{ ...charge, status: "paid" }],
      payments: [{ id: "payment", rent_charge_id: "charge", reversed_at: null },
        { id: "another", rent_charge_id: "charge", reversed_at: null }] });
    await undoFiledItem(admin as never, { id: "item", kind: "rent", created_record: true,
      payment_id: "payment", expense_id: null, rent_charge_id: "charge", prior_charge_status: "pending" });
    expect(admin.tables.rent_charges[0].status).toBe("paid");
  });
  it("removes an expense when its bank item cannot be saved", async () => {
    const admin = fakeAdmin({ property_expenses: [], bank_transactions: [] }, { "bank_transactions:insert": "failure" });
    const result = await fileBankItem({ ...ctx(admin), row: { ...fileRow, direction: "out" } },
      { kind: "expense", propertyId: "home", category: "mortgage", label: "Mortgage" });
    expect(result.success).toBe(false);
    expect(admin.tables.property_expenses).toHaveLength(0);
  });
});
