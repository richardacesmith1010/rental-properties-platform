// A sequential model of the service-role tables and manager access functions.
// PostgreSQL's two-session tests cover advisory-lock behavior.
// The query builder imitates Supabase's dynamic row and column shapes.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from "vitest";
type Row = Record<string, any>;
type Failure = { code: string; message: string };
const error = (code: string, message: string): Failure => ({ code, message });
const clone = <T>(value: T): T => structuredClone(value);

export function createFakeWorld() {
  const tables: Record<string, Row[]> = {
    profiles: [], invitations: [], property_managers: [], properties: [],
    ownership_accounts: [], ownership_account_members: []
  };
  const ops: string[] = [];
  const hooks = { before: new Map<string, Array<() => Promise<void> | void>>(),
    after: new Map<string, Array<() => Promise<void> | void>>() };
  const failures = new Map<string, number>();
  const authFailures = new Map<string, number>();
  const record = async (name: string, work: () => Promise<any> | any) => {
    ops.push(name);
    const before = hooks.before.get(name)?.shift();
    if (before) await before();
    const value = await work();
    const after = hooks.after.get(name)?.shift();
    if (after) await after();
    return value;
  };
  const consume = (name: string) => {
    const count = failures.get(name) ?? 0;
    if (!count) return false;
    failures.set(name, count - 1);
    return true;
  };
  const accountFor = (propertyId: string) => tables.ownership_accounts.find(
    (account) => account.id === tables.properties.find((home) => home.id === propertyId)?.owner_account_id
  );
  const guard = (table: string, row: Row): Failure | null => {
    const account = accountFor(row.property_id);
    if (table === "property_managers" && account?.managed_client) {
      return error("42501", "client manager rows are guarded");
    }
    if (table === "invitations" && ["manager", "owner"].includes(row.role)
      && account?.managed_client && account.claim_state === "unclaimed") {
      return error("42501", "unclaimed client invitations are guarded");
    }
    return null;
  };
  const key = (table: string, row: Row) => table === "property_managers"
    ? `${row.property_id}:${row.manager_profile_id}`
    : table === "invitations"
      ? `${row.email}:${row.role}:${row.invited_by}:${row.property_id ?? "null"}`
      : table === "profiles" ? row.email : row.id;
  const query = (table: string) => {
    let op = "select";
    let columns = "*";
    let payload: Row[] = [];
    let options: Row = {};
    let single: "maybe" | "required" | null = null;
    let max = Infinity;
    const filters: Array<(row: Row) => boolean> = [];
    const q: any = {
      select(value = "*") { columns = value; return q; },
      eq(field: string, value: any) { filters.push((row) => row[field] === value); return q; },
      neq(field: string, value: any) { filters.push((row) => row[field] !== value); return q; },
      in(field: string, values: any[]) { filters.push((row) => values.includes(row[field])); return q; },
      limit(value: number) { max = value; return q; },
      maybeSingle() { single = "maybe"; return q; },
      single() { single = "required"; return q; },
      insert(value: Row | Row[]) { op = "insert"; payload = Array.isArray(value) ? value : [value]; return q; },
      upsert(value: Row | Row[], opts: Row = {}) {
        op = "upsert"; payload = Array.isArray(value) ? value : [value]; options = opts; return q;
      },
      update(value: Row) { op = "update"; payload = [value]; return q; },
      delete() { op = "delete"; return q; },
      then(resolve: (value: Row) => void, reject?: (reason: unknown) => void) {
        return execute().then(resolve, reject);
      }
    };
    const execute = () => record(`db:${table}:${op}`, () => {
      if (consume(`db:${table}:${op}`)) return { data: null, error: error("XX000", "test failure") };
      const current = tables[table];
      let rows = current.filter((row) => filters.every((predicate) => predicate(row))).slice(0, max);
      if (op === "insert" || op === "upsert") {
        const beforeWrite = clone(current);
        const reject = (failure: Failure) => {
          current.splice(0, current.length, ...beforeWrite);
          return { data: null, error: failure };
        };
        const seen = new Set<string>();
        const changes: Row[] = [];
        for (const input of payload) {
          const row = clone(input);
          if (table === "invitations") {
            row.id ??= crypto.randomUUID(); row.created_at ??= new Date().toISOString();
            row.accepted_at ??= null; row.invited_profile_id ??= null;
          }
          if (table === "property_managers") row.assigned_directly ??= true;
          const blocked = guard(table, row);
          if (blocked) return reject(blocked);
          if (table === "invitations" && !["pending", "accepted", "expired"].includes(row.status)) {
            return reject(error("23514", "invalid invitation status"));
          }
          const identity = key(table, row);
          if (seen.has(identity)) {
            if (options.ignoreDuplicates) continue;
            return reject(error("21000", "ON CONFLICT DO UPDATE affected row twice"));
          }
          seen.add(identity);
          const existing = current.find((candidate) => key(table, candidate) === identity);
          if (existing) {
            if (op === "insert") return reject(error("23505", "duplicate key"));
            if (options.ignoreDuplicates) continue;
            const { id: _incomingId, ...changesWithoutId } = row;
            Object.assign(existing, changesWithoutId);
            changes.push(existing);
          } else changes.push(row);
        }
        for (const row of changes) if (!current.includes(row)) current.push(row);
        rows = changes;
      } else if (op === "update") {
        for (const row of rows) {
          const blocked = guard(table, { ...row, ...payload[0] });
          if (blocked) return { data: null, error: blocked };
        }
        rows.forEach((row) => Object.assign(row, payload[0]));
      } else if (op === "delete") {
        for (const row of rows) {
          const blocked = guard(table, row);
          if (blocked) return { data: null, error: blocked };
        }
        tables[table] = current.filter((row) => !rows.includes(row));
      }
      const selected = rows.map((row) => columns === "*" ? clone(row) : Object.fromEntries(
        columns.split(",").map((field) => field.trim()).map((field) => [field, row[field]])
      ));
      if (single === "required" && selected.length !== 1) {
        return { data: null, error: error("PGRST116", "row not found") };
      }
      return { data: single ? selected[0] ?? null : selected, error: null };
    });
    return q;
  };
  const snapshot = () => clone(tables);
  const restore = (saved: Record<string, Row[]>) => Object.keys(tables).forEach((table) => { tables[table] = saved[table]; });
  const pair = (propertyId: string, profileId: string) => tables.property_managers.find(
    (row) => row.property_id === propertyId && row.manager_profile_id === profileId
  );
  const activeGrant = (propertyId: string, profileId: string) => pair(propertyId, profileId)?.active === true;
  const upsertGrant = (propertyId: string, profileId: string, direct: boolean) => {
    const found = pair(propertyId, profileId);
    if (found) {
      const wasActive = found.active;
      found.active = true;
      found.assigned_directly = direct || (wasActive && found.assigned_directly);
      return !wasActive;
    }
    tables.property_managers.push({ property_id: propertyId, manager_profile_id: profileId,
      active: true, assigned_directly: direct });
    return true;
  };
  const rpc = (name: string, args: Row) => record(`rpc:${name}`, () => {
    if (consume(`rpc:${name}`)) return { data: null, error: error("XX000", "test failure") };
    const saved = snapshot();
    try {
      let data: Row[] = [];
      const profile = tables.profiles.find((row) => row.id === args.p_profile_id);
      if (name === "manager_invite_grant") {
        const ids = [...new Set((args.p_invitation_ids ?? []).filter((id: string | null) => id != null))];
        if (!profile || profile.role !== "manager" || !ids.length) throw error("22023", "invalid manager or ids");
        const invitations = ids.map((id) => tables.invitations.find((row) => row.id === id))
          .sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
        if (invitations.some((row) => !row || row.role !== "manager" || row.invited_by !== args.p_inviter_id
          || !row.property_id || (row.invited_profile_id !== args.p_profile_id
            && !(row.invited_profile_id == null && row.email.toLowerCase() === profile.email.toLowerCase())))) {
          throw error("P0002", "invitation not bound");
        }
        ops.push("rpc:manager_access_lock");
        for (const row of invitations as Row[]) {
          let outcome = "not_pending";
          if (row.status === "pending") {
            const blocked = guard("property_managers", { property_id: row.property_id });
            if (blocked) throw blocked;
            upsertGrant(row.property_id, args.p_profile_id, false);
            row.invited_profile_id = args.p_profile_id;
            if (args.p_accept) { row.status = "accepted"; row.accepted_at = new Date().toISOString(); }
            outcome = args.p_accept ? "accepted" : "granted";
          } else if (row.status === "accepted") outcome = "already_accepted";
          data.push({ invitation_id: row.id, property_id: row.property_id, outcome });
        }
      } else if (name === "manager_grant_homes") {
        if (args.p_profile_id == null) throw error("22023", "profile required");
        ops.push("rpc:manager_access_lock");
        const propertyIds = [...new Set<string>((args.p_property_ids ?? []).filter((id: string | null) => id != null))]
          .sort();
        for (const propertyId of propertyIds) {
          const blocked = guard("property_managers", { property_id: propertyId });
          if (blocked) throw blocked;
          data.push({ property_id: propertyId, added: upsertGrant(propertyId, args.p_profile_id, true) });
        }
      } else if (name === "manager_invite_accept") {
        if (profile?.role === "manager") {
          ops.push("rpc:manager_access_lock");
          for (const row of tables.invitations.filter((item) => item.role === "manager" && item.status === "pending"
            && (item.invited_profile_id === args.p_profile_id || (item.invited_profile_id == null
              && item.email.toLowerCase() === profile.email.toLowerCase())) && item.property_id != null)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
            const hasAccess = activeGrant(row.property_id, args.p_profile_id);
            if (hasAccess) { row.status = "accepted"; row.accepted_at = new Date().toISOString();
              row.invited_profile_id = args.p_profile_id; }
            data.push({ invitation_id: row.id, property_id: row.property_id,
              outcome: hasAccess ? "accepted" : "no_access" });
          }
        }
      } else if (name === "manager_invite_revoke") {
        const row = tables.invitations.find((item) => item.id === args.p_invitation_id
          && item.invited_by === args.p_inviter_id && item.role === "manager");
        if (!row) data = [{ outcome: "not_found", profile_id: null, released: false,
          other_live: false, kept_direct: false }];
        else {
          ops.push("rpc:manager_access_lock");
          const target = row.invited_profile_id ?? tables.profiles.find((item) => item.role === "manager"
            && item.email.toLowerCase() === row.email.toLowerCase())?.id ?? null;
          const output = { outcome: row.status === "pending" ? "revoked" : row.status === "accepted"
            ? "accepted" : "already_revoked", profile_id: target, released: false,
          other_live: false, kept_direct: false };
          if (row.status === "pending") {
            row.status = "expired"; row.accepted_at = null;
            output.other_live = target != null && row.property_id != null && tables.invitations.some((other) => other.id !== row.id
              && other.property_id === row.property_id && other.email.toLowerCase() === row.email.toLowerCase()
              && other.role === "manager" && ["pending", "accepted"].includes(other.status));
            const grant = target ? pair(row.property_id, target) : null;
            if (!output.other_live && grant?.active) {
              if (grant.assigned_directly) output.kept_direct = true;
              else {
                const blocked = guard("property_managers", { property_id: row.property_id });
                if (blocked) throw blocked;
                grant.active = false; output.released = true;
              }
            }
          }
          data = [output];
        }
      } else throw error("42883", "unknown function");
      return { data, error: null };
    } catch (reason) {
      restore(saved);
      return { data: null, error: reason as Failure };
    }
  });
  const seed = (table: string, row: Row) => {
    const seeded = clone(row);
    if (table === "property_managers") seeded.assigned_directly ??= true;
    tables[table].push(seeded);
    return seeded;
  };
  const world = {
    ops, tables, admin: { from: query, rpc, auth: { admin: {} as Row } },
    seed, read: (table: string) => clone(tables[table]),
    patch: (table: string, predicate: (row: Row) => boolean, changes: Row) => {
      tables[table].filter(predicate).forEach((row) => Object.assign(row, changes));
    },
    beforeOp: (name: string, fn: () => Promise<void> | void) => {
      hooks.before.set(name, [...(hooks.before.get(name) ?? []), fn]);
    },
    afterOp: (name: string, fn: () => Promise<void> | void) => {
      hooks.after.set(name, [...(hooks.after.get(name) ?? []), fn]);
    },
    failNext: (table: string, op: string) => {
      const name = table === "rpc" ? `rpc:${op}` : `db:${table}:${op}`;
      failures.set(name, (failures.get(name) ?? 0) + 1);
    },
    failAuth: (method: string) => authFailures.set(method, (authFailures.get(method) ?? 0) + 1),
    consumeAuth: (method: string) => {
      const count = authFailures.get(method) ?? 0;
      if (count) authFailures.set(method, count - 1);
      return count > 0;
    },
    record, guard, upsertGrant
  };
  return world;
}

export type FakeWorld = ReturnType<typeof createFakeWorld>;

export function expectNoWrites(world: FakeWorld) {
  expect(world.ops.filter((op) => /^db:[^:]+:(insert|upsert|update|delete)$/.test(op)
    || op.startsWith("rpc:") || ["auth.insert", "auth.createUser", "auth.generateLink",
      "auth.inviteUserByEmail", "auth.email"].includes(op))).toEqual([]);
}
