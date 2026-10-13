import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261015_sprint222_deposits_cash.sql"), "utf8");

describe("Sprint 222 migration", () => {
  it("creates only a return table and keeps client writes blocked", () => {
    expect([...sql.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]))
      .toEqual(["lease_deposit_returns"]);
    expect(sql).toContain("alter table public.lease_deposit_returns enable row level security");
    expect(sql).toContain("grant select on public.lease_deposit_returns to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.lease_deposit_returns/i);
    expect(sql).not.toMatch(/alter table public\.leases add column/i);
    expect(sql).toContain("create trigger lease_deposit_returns_bound");
    expect(sql).toContain("create trigger leases_deposit_freeze");
  });
  it("locks leases and audits both service-only deposit RPCs", () => {
    for (const name of ["record_deposit_return", "clear_deposit_return"]) {
      const start = sql.indexOf(`create function public.${name}(`);
      const body = sql.slice(start, sql.indexOf("end $$;", start));
      expect(body).toContain("security definer set search_path = ''");
      expect(body).toContain("insert into public.audit_logs");
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\(`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role;`));
    }
    expect(sql).toMatch(/from public\.leases where id = p_lease_id for update/);
    expect(sql).toContain("Undo the deposit return before changing the deposit.");
    expect(sql).toContain("create function public.lease_has_deposit_return");
  });
  it("locks the sync lease and saves a complete payload in one set update", () => {
    expect(sql).toContain("bank_accounts_balance_triple");
    expect(sql).toContain("select id into v_connection from public.bank_connections");
    expect(sql).toMatch(/sync_lease_until > now\(\).*for update/s);
    expect(sql).toContain("update public.bank_accounts b set");
    expect(sql).toContain("from jsonb_to_recordset(p_balances)");
    expect(sql).toContain("if p_complete then");
    expect(sql).toContain("grant execute on function public.save_bank_balances(uuid,uuid,jsonb,boolean) to service_role");
    expect(sql).not.toMatch(/grant (insert|update|delete) on public\.bank_accounts to authenticated/i);
  });
});
