import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261016_sprint223_account_tasks.sql"), "utf8");
describe("account tasks migration", () => {
  it("enables RLS, revokes before grants, and limits update columns", () => {
    expect(sql).toContain("alter table public.account_tasks enable row level security");
    expect(sql.indexOf("revoke all on public.account_tasks")).toBeLessThan(sql.indexOf("grant select, insert, delete"));
    const grant = sql.match(/grant update \(([^)]+)\)/)?.[1] ?? "";
    expect(grant).toContain("last_done_on");
    expect(grant).not.toContain("last_done_by_profile_id");
  });
  it("has the done-by trigger, composite FK and due-date check", () => {
    expect(sql).toContain("create trigger account_tasks_done_by");
    expect(sql).toContain("security invoker set search_path = ''");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("foreign key (owner_partner_id, account_id)");
    expect(sql).toContain("check ((frequency = 'as_needed') = (next_due_on is null))");
    expect(sql).not.toContain("is_creator_of_account");
  });
});
