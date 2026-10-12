import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: true, member: true, role: "owner", accountType: "llc",
  errorTable: "", calls: [] as string[],
  rows: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: db.user ? { id: "user" } : null }, error: null }) },
  rpc: async () => ({ data: db.member, error: null }),
  from: (table: string) => {
    db.calls.push(table);
    const rows = db.rows[table] ?? (table === "ownership_accounts" ? [{ id: "llc", account_type: db.accountType }]
      : table === "profiles" ? [{ id: "user", role: db.role }] : []);
    const filters: Array<["eq" | "in", string, unknown]> = [];
    const filtered = () => rows.filter((row) => filters.every(([kind, key, value]) => kind === "eq"
      ? row[key] === value : (value as unknown[]).includes(row[key])));
    const result = () => ({ data: filtered(), error: db.errorTable === table ? { code: "XX000" } : null });
    const builder = { select: () => builder,
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return builder; },
      in: (key: string, value: unknown) => { filters.push(["in", key, value]); return builder; },
      maybeSingle: async () => ({ data: filtered()[0] ?? null, error: result().error }),
      then: (resolve: (value: unknown) => void) => resolve(result()) };
    return builder;
  }
}) }));
import { loadPartners, loadPartnerReport } from "@/lib/partners";

beforeEach(() => { db.user = true; db.member = true; db.role = "owner";
  db.accountType = "llc"; db.errorTable = ""; db.calls = []; db.rows = {}; });
describe("partner loader authorization and errors", () => {
  it.each([
    ["manager", true, "manager", "llc"], ["tenant", true, "tenant", "llc"],
    ["unrelated owner", false, "owner", "llc"], ["individual owner", true, "owner", "individual"]
  ])("denies %s from both loaders without reading partner rows", async (_label, member, role, accountType) => {
    db.member = member as boolean; db.role = role as string; db.accountType = accountType as string;
    expect(await loadPartners("llc")).toEqual({ ok: false, error: "not_allowed" });
    expect(await loadPartnerReport("llc", "all")).toEqual({ ok: false, error: "not_allowed" });
    expect(db.calls).not.toContain("account_partners");
  });
  it("denies an unauthenticated caller", async () => {
    db.user = false;
    expect(await loadPartners("llc")).toEqual({ ok: false, error: "not_allowed" });
    expect(await loadPartnerReport("llc", "all")).toEqual({ ok: false, error: "not_allowed" });
  });
  it("loadPartnerReport reads scoped bills, attribution and payments", async () => {
    db.rows = {
      properties: [{ id: "home", owner_account_id: "llc" }],
      account_partners: [{ id: "p", account_id: "llc", display_name: "Alice", active: true, profile_id: null }],
      property_expenses: [{ id: "bill", property_id: "home", category: "improvement",
        amount_cents: 10000, expense_date: "2026-01-02" }],
      expense_partner_attributions: [{ expense_id: "bill", partner_id: "p" }],
      partner_payments: [{ id: "pay", account_id: "llc", from_partner_id: "p", to_partner_id: null,
        amount_cents: 1000, paid_on: "2026-01-03", kind: "settle_up", status: "done", note: null }]
    };
    const result = await loadPartnerReport("llc", { from: "2026-01-01", to: "2026-02-01" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows.find((row) => row.id === "p")?.putInCents).toBe(11000);
      expect(result.data.rows.find((row) => row.id === "p")?.paidByKind.improvements).toBe(10000);
    }
    expect(db.calls).toContain("expense_partner_attributions");
  });
  it("fails closed on a partner query error", async () => {
    db.errorTable = "account_partners";
    expect(await loadPartners("llc")).toEqual({ ok: false, error: "unavailable" });
    expect(await loadPartnerReport("llc", "all")).toEqual({ ok: false, error: "unavailable" });
  });
});
