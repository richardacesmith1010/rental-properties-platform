import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(),
  "../../supabase/migrations/20261102_sprint248a_retention_report.sql"), "utf8");
const body = sql.match(/create function public\.report_retention_candidates\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/i)?.[1];
if (!body) throw new Error("Retention report function body missing");

const callable = new Set([
  "count", "max", "min", "greatest", "coalesce", "make_date", "extract", "clock_timestamp", "sum",
  "exists", "in", "values", "select"
]);
const tables = new Set([
  "retention_reports", "payments", "rent_charges", "property_expenses", "bank_transactions",
  "manager_payments", "partner_payments", "lease_deposit_returns", "property_tax_years", "leases",
  "document_packets", "documents", "maintenance_tickets", "maintenance_status_history",
  "maintenance_photos", "inspections", "rent_charge_lines"
]);

function withoutCommentsAndStrings(source: string): string {
  return source.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, " ");
}

function assertReadOnlySurface(source: string): void {
  const clean = withoutCommentsAndStrings(source).toLowerCase();
  const ctes = new Set([...clean.matchAll(/\b([a-z_]\w*)\s*(?:\([^)]*\))?\s+as\s*\(/g)]
    .map((match) => match[1]));
  const callSql = clean.replace(/insert\s+into\s+public\.retention_reports\s*\(/g,
    "insert into public.retention_reports ");
  for (const match of callSql.matchAll(/\b([a-z_]\w*)\s*\(/g)) {
    if (["as", "and", "or"].includes(match[1])) continue; // SQL grouping syntax, not calls.
    expect(callable.has(match[1]) || ctes.has(match[1]), `Disallowed call: ${match[1]}`).toBe(true);
  }
  expect(clean).not.toMatch(/\b(?:update|truncate|execute|perform|copy)\b/);
  expect(callSql).not.toMatch(/\b(?:storage|auth|public)\s*\.\s*[a-z_]\w*\s*\(/);
  expect(clean).not.toMatch(/\bpg_\w*\s*\(/);

  // EXTRACT has a FROM keyword but does not name a table.
  const tableSql = clean.replace(/extract\s*\(\s*year\s+from\s+v_today\s*\)/g, "extract(year v_today)");
  for (const match of tableSql.matchAll(/\b(?:from|join)\s+((?:[a-z_]\w*\.)?[a-z_]\w*)/g)) {
    const target = match[1];
    expect([...tables].some((table) => target === `public.${table}`) || ctes.has(target),
      `Disallowed table: ${target}`).toBe(true);
  }
  const writes = [...clean.matchAll(/\b(insert\s+into|delete\s+from)\s+([a-z_]\w*\.[a-z_]\w*)/g)];
  expect(writes.map((match) => `${match[1]} ${match[2]}`)).toEqual([
    "insert into public.retention_reports", "delete from public.retention_reports"
  ]);
  const deletes = [...source.matchAll(/\bdelete\s+from\s+[^;]+;/gi)];
  expect(deletes).toHaveLength(1);
  expect(deletes[0][0].replace(/\s+/g, " ").trim().toLowerCase()).toBe(
    "delete from public.retention_reports where run_at < v_run_at - interval '400 days';"
  );
}

describe("G1 retention report SQL surface", () => {
  it("allows only the named read tables, calls, and report-table writes", () => {
    assertReadOnlySurface(body);
    expect(sql).toMatch(/security definer set search_path = '' set timezone = 'UTC'/i);
    expect(sql).toMatch(/revoke all on function public\.report_retention_candidates\(\)\s+from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/revoke all on table public\.retention_reports from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/alter table public\.retention_reports enable row level security/i);
    expect(sql).toMatch(/unique \(run_at, category\)/i);
    expect(sql).not.toMatch(/create\s+policy\b/i);
    expect(sql).toContain("cron.schedule('domus-retention-report', '45 9 * * *',");
    expect(sql).toContain("$$select public.report_retention_candidates()$$");
    expect(sql).toContain("-- select cron.unschedule('domus-retention-report');");
    expect(sql).toContain("-- drop function public.report_retention_candidates();");
    expect(sql).toContain("-- drop table public.retention_reports;");
    expect(sql.split("\n").every((line) => line.length <= 140)).toBe(true);
  });

  it.each([
    "select pg_sleep(1);", "select public.anything();", "select set_config('x', 'y', false);",
    "update public.payments set paid_at = clock_timestamp();", "select 1 from other_schema.payments;"
  ])("rejects a forbidden fixture: %s", (fragment) => {
    expect(() => assertReadOnlySurface(`${body}\n${fragment}`)).toThrow();
  });
});

describe("G2 retention rules", () => {
  it("uses one UTC run clock and the pinned cutoff dates", () => {
    const runClock = [
      "v_run_at := greatest(clock_timestamp(), ",
      "coalesce((select max(run_at) from public.retention_reports), ",
      "'-infinity'::timestamptz) + interval '1 microsecond')"
    ].join("");
    expect(body.replace(/\s+/g, " ")).toContain(runClock);
    expect(body).toContain("v_today := (v_run_at at time zone 'UTC')::date");
    expect(body).toContain("make_date(extract(year from v_today)::int - 8, 12, 31)");
    expect(body).toContain("(v_today - interval '7 years')::date");
    expect(body).toContain("(v_today - interval '3 years')::date");
    expect(body).not.toMatch(/\bcurrent_date\b/i);
  });

  it("names every category, anchor, and rule", () => {
    const anchors = [
      "(p.paid_at at time zone 'UTC')::date", "greatest(c.due_date, pd.newest_paid_on",
      "(c.waived_at at time zone 'UTC')::date", "(c.deleted_at at time zone 'UTC')::date",
      "e.expense_date", "b.posted_on", "coalesce((m.paid_at at time zone 'UTC')::date, m.payment_date)",
      "pp.paid_on", "dr.returned_on", "make_date(ty.tax_year, 12, 31)",
      "coalesce((l.terminated_at at time zone 'UTC')::date, l.end_date)",
      "else l.end_date end as anchor", "from public.document_packets packet join lease_anchors",
      "greatest(t.resolved_at, (select max(h.created_at)", "h.to_status in ('resolved', 'closed')"
    ];
    for (const anchor of anchors) expect(body).toContain(anchor);
    for (const name of [
      "payments", "rent_charges", "property_expenses", "bank_transactions", "manager_payments",
      "partner_payments", "lease_deposit_returns", "property_tax_years", "leases",
      "lease_document_packets", "repairs"
    ]) expect(body).toMatch(new RegExp(`\\('${name}', '(?:tax_year\\+7|ended\\+7y|closed\\+3y)', v_`));
    expect(body).toContain("ca.undated_payments > 0");
    expect(body).toContain("ca.anchor > v_money_cutoff");
    expect(body).toContain("line.lease_id = la.id");
  });

  it("keeps the newest payment inside each charge anchor before checking its blocker count", () => {
    expect(body).toContain("max((p.paid_at at time zone 'UTC')::date) as newest_paid_on");
    expect(body).toContain("greatest(c.due_date, pd.newest_paid_on");
    expect(body).toContain("union all select 'rent_charges', ca.anchor, ca.undated_payments > 0");
    expect(body).toContain("sum(case when c.anchor <= k.cutoff and c.blocked then 1 else 0 end)::integer");
  });
});

describe("G2b empty and undated categories", () => {
  it("writes zero counts and null oldest dates for empty categories, excluding null anchors", () => {
    expect(body).toContain("from categories k left join candidates c on c.category = k.category and c.anchor is not null");
    expect(body).toContain("sum(case when c.anchor <= k.cutoff then 1 else 0 end)::integer");
    expect(body).toContain("min(case when c.anchor <= k.cutoff then c.anchor end)");
    expect(body).toContain("get diagnostics v_count = row_count");
    expect(body).toContain("return v_count");
    expect(sql).not.toMatch(/create\s+trigger\s+\w+\s+[^;]*retention_reports/i);
  });
});
