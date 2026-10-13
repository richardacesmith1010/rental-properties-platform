export type RecordRow = Record<string, unknown>;
export function fakeAdmin(initial: Record<string, RecordRow[]>, failures: Record<string, string> = {}, raceRule?: RecordRow) {
  const tables = structuredClone(initial);
  const writes: Array<{ table: string; op: string; row?: RecordRow }> = [];
  const queries: Array<{ table: string; op: string; filters: Array<[string, string, unknown]>;
    options?: Record<string, unknown> }> = [];
  let serial = 0;
  const attempts: Record<string, number> = {};
  function from(table: string) {
    let op = "read"; let payload: RecordRow = {}; const filters: Array<(row: RecordRow) => boolean> = [];
    const recorded: Array<[string, string, unknown]> = [];
    const entry = { table, op, filters: recorded, options: undefined as Record<string, unknown> | undefined };
    queries.push(entry);
    let selectFields = "";
    const query = {
      select(fields: string) { selectFields = fields; return query; },
      eq(field: string, value: unknown) { recorded.push(["eq", field, value]);
        filters.push((row: RecordRow) => row[field] === value); return query; },
      is(field: string, value: unknown) { filters.push((row: RecordRow) => row[field] === value); return query; },
      in(field: string, values: unknown[]) { recorded.push(["in", field, values]);
        filters.push((row: RecordRow) => values.includes(row[field])); return query; },
      or(value: string) { recorded.push(["or", "", value]);
        const match = /^([a-z_]+)\.is\.null,\1\.lt\.(.+)$/.exec(value);
        if (match) filters.push((row: RecordRow) => row[match[1]] == null || String(row[match[1]]) < match[2]);
        return query; },
      not(field: string, _operator: string, value: unknown) {
        filters.push((row: RecordRow) => row[field] !== value); return query;
      },
      gt(field: string, value: unknown) {
        filters.push((row: RecordRow) => String(row[field]) > String(value)); return query;
      },
      gte(field: string, value: unknown) { filters.push((row: RecordRow) => String(row[field]) >= String(value)); return query; },
      lte(field: string, value: unknown) { filters.push((row: RecordRow) => String(row[field]) <= String(value)); return query; },
      order() { return query; }, limit() { return query; }, insert(value: RecordRow) {
        op = "insert"; entry.op = op; payload = value; return query; },
      upsert(value: RecordRow, options?: Record<string, unknown>) {
        op = "upsert"; entry.op = op; entry.options = options; payload = value; return query; },
      update(value: RecordRow) { op = "update"; entry.op = op; payload = value; return query; },
      delete() { op = "delete"; entry.op = op; return query; },
      async execute(single = false) {
        const source = tables[table] || (tables[table] = []);
        const found = source.filter((row) => filters.every((filter) => filter(row)));
        const key = `${table}:${op}`;
        attempts[key] = (attempts[key] || 0) + 1;
        const scheduled = failures[key]?.split("@");
        if (scheduled && (scheduled.length === 1 || attempts[key] === Number(scheduled[1]))) {
          if (key === "bank_rules:insert" && scheduled[0] === "23505" && raceRule) source.push(raceRule);
          return { data: null, error: { code: scheduled[0] }, count: 0 };
        }
        if (op === "upsert") {
          const duplicate = source.some((row) => row.bank_account_id === payload.bank_account_id
            && row.external_id === payload.external_id);
          if (duplicate) return { data: null, error: null, count: 0 };
        }
        if (op === "insert" || op === "upsert") {
          const row = { id: `${table}-${++serial}`, ...payload };
          source.push(row); writes.push({ table, op, row });
          return { data: single ? row : [row], error: null, count: 1 };
        }
        if (op === "update") {
          found.forEach((row) => Object.assign(row, payload));
          writes.push({ table, op, row: payload });
          return { data: selectFields ? found : null, error: null, count: found.length };
        }
        if (op === "delete") {
          for (const row of found) source.splice(source.indexOf(row), 1);
          writes.push({ table, op });
          return { data: null, error: null, count: found.length };
        }
        return { data: single ? found[0] || null : found, error: null, count: found.length };
      }, single() { return query.execute(true); }, maybeSingle() { return query.execute(true); },
      then(resolve: (value: unknown) => void) { return query.execute().then(resolve); }
    };
    return query;
  }
  return { from, tables, writes, queries };
}
export const BANK_ID = "00000000-0000-4000-8000-000000000001";
export const base = { bank_accounts: [{ id: BANK_ID, owner_account_id: "account", nickname: "Checking", institution: "other" }],
  ownership_account_members: [{ account_id: "account", profile_id: "owner", member_role: "owner", active: true }],
  bank_transactions: [], bank_skipped_fingerprints: [], bank_rules: [] };
export const tokenRow = { bankAccountId: BANK_ID, profileId: "owner", postedOn: "2026-10-05", amountCents: 235000,
  direction: "in" as const, description: "ACH CREDIT", occurrenceIndex: 0 };
