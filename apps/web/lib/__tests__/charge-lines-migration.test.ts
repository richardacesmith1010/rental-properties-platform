import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261013_sprint220_charge_lines.sql"), "utf8");

describe("rent charge lines migration §8.9", () => {
  it("enables RLS and revokes default writes before select grant", () => {
    expect(sql).toMatch(/alter table public\.rent_charge_lines enable row level security/i);
    expect(sql.indexOf("revoke all on public.rent_charge_lines from anon, authenticated"))
      .toBeLessThan(sql.indexOf("grant select on public.rent_charge_lines to authenticated"));
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.rent_charge_lines to authenticated/i);
  });
  it("uses only locked service role RPCs with hardened search paths", () => {
    for (const name of ["add_rent_charge_line", "remove_rent_charge_line", "create_rent_charge_with_lines"]) {
      const section = sql.slice(sql.indexOf(`create function public.${name}`));
      expect(section).toMatch(/security definer set search_path = ''/i);
      expect(section).toMatch(/pg_advisory_xact_lock/);
      expect(section).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, "i"));
      expect(section).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, "i"));
    }
  });
  it("stores explicit actor, cascades hard deletes, and totals in bigint", () => {
    expect(sql).toMatch(/created_by_profile_id uuid not null references public\.profiles\(id\)/i);
    expect(sql).toMatch(/charge_id uuid references public\.rent_charges\(id\) on delete cascade/i);
    expect(sql).toMatch(/v_total bigint/);
    expect(sql).toMatch(/sum\(amount_cents::bigint\)/);
  });
  it("deduplicates an expense source and returns its existing line id", () => {
    expect(sql).toMatch(/create unique index rent_charge_lines_expense_unique/);
    expect(sql).toMatch(/on public\.rent_charge_lines\(source_expense_id\) where source_expense_id is not null/i);
    expect(sql).toMatch(/on conflict \(source_expense_id\) where source_expense_id is not null do nothing/i);
    expect(sql).toMatch(/select id into v_id from public\.rent_charge_lines where source_expense_id = p_source_expense_id/i);
  });
  it("selects all utilities, then oldest credits that keep the total positive", () => {
    const functionSql = sql.slice(sql.indexOf("create function public.create_rent_charge_with_lines"));
    expect(functionSql).toMatch(/l\.kind = 'utility'[\s\S]*order by l\.created_at, l\.id loop/);
    expect(functionSql).toMatch(/l\.kind = 'credit'[\s\S]*order by l\.created_at, l\.id loop/);
    expect(functionSql).toMatch(/if v_total \+ v_line\.amount_cents::bigint > 0 then/);
    expect(functionSql).toMatch(/l\.charge_id is null and l\.id = any\(v_selected\)/);
    expect(functionSql).toMatch(/v_newest <= p_due_date/);
  });
});
