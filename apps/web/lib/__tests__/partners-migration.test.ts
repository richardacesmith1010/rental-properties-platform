import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261012_sprint219_partners.sql"), "utf8");
describe("Sprint 219 migration text", () => {
  it("enables owner-only RLS, scoped helpers and column-level updates", () => {
    for (const table of ["account_partners", "partner_payments", "expense_partner_attributions"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).not.toContain("is_creator_of_account");
    expect(sql).not.toMatch(/grant .* to anon/i);
    expect(sql).not.toMatch(/property_expenses add column/i);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(3);
    expect(sql.match(/from public, anon/g)).toHaveLength(3);
    expect(sql).toContain("grant update (display_name, profile_id, active)");
    expect(sql).toContain("grant update (partner_id)");
    for (const policy of ["account_partners_insert", "account_partners_update",
      "partner_payments_insert", "partner_payments_update"]) {
      const block = sql.split(`create policy ${policy}`)[1]?.split("create policy ")[0] ?? "";
      expect(block).toContain("public.is_llc_account(account_id)");
    }
    expect(sql).toContain("foreign key (partner_id, account_id)");
    expect(sql).toContain("foreign key (from_partner_id, account_id)");
    expect(sql).toContain("foreign key (to_partner_id, account_id)");
    for (const value of ["mortgage", "insurance", "property_tax", "hoa", "repair", "maintenance",
      "utility", "management_fee", "legal", "other", "improvement"]) expect(sql).toContain(`'${value}'`);
  });
});
