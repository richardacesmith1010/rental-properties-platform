import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261014_sprint224_bank_sync.sql"), "utf8");

describe("Sprint 224 migration security", () => {
  it("revokes client grants before select-only grants and keeps secrets private", () => {
    for (const table of ["bank_connections", "bank_connection_secrets", "bank_review_items"]) {
      expect(sql.indexOf(`revoke all on public.${table}`)).toBeGreaterThan(sql.indexOf(`create table public.${table}`));
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete) on public\.bank_connection_secrets/i);
    expect(sql).not.toMatch(/create policy .+ on public\.bank_connection_secrets/i);
    expect(sql).toContain("grant select on public.bank_connections to authenticated");
    expect(sql).toContain("grant select on public.bank_review_items to authenticated");
  });

  it("enforces account identity, flexible institution names and no plaintext legacy tokens", () => {
    expect(sql).toContain("unique (bank_account_id, external_id)");
    expect(sql).toContain("foreign key (bank_account_id, owner_account_id)");
    expect(sql).toContain("char_length(trim(institution)) between 1 and 80");
    expect(sql).toContain("check (plaid_access_token is null)");
    expect(sql).toContain("where external_id is not null");
  });

  it("marks every callable RPC as security definer and service-role-only", () => {
    const names = ["create_bank_connection", "file_synced_bank_item", "resolve_bank_review_item",
      "disconnect_bank_connection", "confirm_bank_account_links", "skip_bank_account_match",
      "save_bank_sync_cursor", "acquire_bank_sync_lease"];
    for (const name of names) {
      const start = sql.indexOf(`create function public.${name}(`);
      expect(start).toBeGreaterThan(-1);
      expect(sql.slice(start, sql.indexOf("end $$;", start))).toContain("security definer set search_path = ''");
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\(`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
    expect(sql).toContain("revoke all on function public._file_bank_choice(jsonb,uuid)");
    expect(sql).not.toContain("grant execute on function public._file_bank_choice");
  });
  it("10 orders each table revoke before grants and grants authenticated no writes", () => {
    for (const table of ["bank_connections", "bank_connection_secrets", "bank_review_items"]) {
      const revoke = sql.indexOf(`revoke all on public.${table} from public, anon, authenticated`);
      expect(revoke).toBeGreaterThan(-1);
      const grants = [...sql.matchAll(new RegExp(`grant [^;]+ on public\\.${table} to [^;]+;`, "gi"))];
      expect(grants.every((grant) => (grant.index ?? -1) > revoke)).toBe(true);
      expect(sql).not.toMatch(new RegExp(`grant (?:insert|update|delete) on public\\.${table} to authenticated`, "i"));
    }
    expect(sql).toMatch(/plaid_item_id text not null unique/i);
    expect(sql).toMatch(/plaid_account_id text unique/i);
    expect(sql).toContain("unique (id, owner_account_id)");
  });
  it("10 every function revokes public anon and authenticated and grants only service role", () => {
    const functions = [...sql.matchAll(/create function public\.([a-z_]+)\(/g)].map((match) => match[1]);
    expect(functions).toContain("_file_bank_choice");
    for (const name of functions) {
      const revoke = sql.match(new RegExp(`revoke all on function public\\.${name}\\([^;]+;`, "i"))?.[0];
      expect(revoke).toMatch(/from public, anon, authenticated/);
      const grants = [...sql.matchAll(new RegExp(`grant [^;]+ on function public\\.${name}\\([^;]+;`, "gi"))];
      expect(grants.every((grant) => /to service_role;/i.test(grant[0]))).toBe(true);
      if (name === "_file_bank_choice" || name === "touch_bank_review_item") expect(grants).toHaveLength(0);
      else expect(grants).toHaveLength(1);
      const start = sql.indexOf(`create function public.${name}(`);
      expect(sql.slice(start, sql.indexOf("as $$", start))).toContain("security definer set search_path = ''");
    }
  });
});
