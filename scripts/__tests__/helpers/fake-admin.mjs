import { createHash } from "node:crypto";

function deterministicUuid(label) {
  const hex = createHash("sha1").update(`domus:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const TABLES = new Set([
  "profiles", "ownership_accounts", "ownership_account_members", "properties", "units", "property_managers",
  "leases", "invitations", "rent_charges", "payments", "property_expenses", "bank_accounts", "bank_review_items",
  "bank_transactions", "bank_skipped_fingerprints", "inbox_threads", "inbox_messages", "maintenance_tickets",
  "maintenance_photos"
]);
const FORBIDDEN = new Set(["notifications", "notification_deliveries", "message_deliveries", "communication_logs", "audit_logs"]);
const EXPECTED_WRITES = new Set([
  "profiles", "ownership_accounts", "ownership_account_members", "properties", "units", "property_managers",
  "leases", "rent_charges", "payments", "property_expenses", "bank_accounts", "bank_review_items",
  "inbox_threads", "inbox_messages", "maintenance_tickets", "maintenance_photos", "createUser",
  "updateUserById", "storage"
]);
const uniqueKeys = {
  profiles: [["email"]], ownership_accounts: [["created_by_profile_id", "account_type"]],
  ownership_account_members: [["account_id", "profile_id"]],
  units: [["property_id", "unit_number"]], rent_charges: [["lease_id", "due_date", "category"]],
  bank_accounts: [["owner_account_id", "institution", "nickname"]],
  bank_review_items: [["bank_account_id", "external_id"]],
  bank_transactions: [["bank_account_id", "external_id"], ["bank_account_id", "fingerprint"]],
  inbox_threads: [["property_id", "entity_id", "subject"]]
};
function clone(value) { return structuredClone(value); }
const uuidColumn = (key) => key === "id" || key.endsWith("_id") && key !== "external_id";
const invalidUuid = (key, value) => uuidColumn(key) && typeof value === "string" &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const uuidError = { code: "22P02", message: "invalid input syntax for type uuid" };
function validDemoMetadata(payload) {
  if (!payload.app_metadata) return true;
  const app = payload.app_metadata;
  const user = payload.user_metadata;
  return Object.keys(app).sort().join() === "appreview_password_hash,appreview_role,appreview_seed" &&
    Object.keys(user).sort().join() === "full_name,role" &&
    app.appreview_seed === "domus-appreview-v1" && app.appreview_role === user.role &&
    ["owner", "tenant"].includes(user.role) && typeof user.full_name === "string" &&
    /^[0-9a-f]{64}$/.test(app.appreview_password_hash);
}
function checkRow(table, row, rows, tables) {
  if (table === "maintenance_tickets" && !row.property_id) throw new Error("ticket property_id required");
  if (table === "leases" && row.active && !["active", "expiring_soon"].includes(row.lease_status)) {
    throw new Error("invalid active lease status");
  }
  if (table === "leases" && row.due_day_of_month && (row.due_day_of_month < 1 || row.due_day_of_month > 28)) {
    throw new Error("invalid due day");
  }
  if (table === "payments" && !["manual", "stripe", "bank_feed", "legacy"].includes(row.recorded_via)) {
    throw new Error("invalid recorded_via");
  }
  if (table === "bank_skipped_fingerprints" && !/^[0-9a-f]{64}$/.test(row.fingerprint)) {
    throw new Error("invalid fingerprint");
  }
  if (table === "bank_review_items" && (row.amount_cents <= 0 || row.description?.length > 200)) {
    throw new Error("invalid review item");
  }
  if (table === "bank_accounts" && (row.institution?.length < 1 || row.institution?.length > 80 ||
    row.nickname?.length < 1 || row.nickname?.length > 60 || row.mask?.length > 4 ||
    !["upload", "plaid"].includes(row.source))) throw new Error("invalid bank account");
  if (table === "bank_accounts" && [row.balance_cents, row.balance_as_of, row.balance_source]
    .filter((value) => value != null).length % 3 !== 0) throw new Error("incomplete bank balance");
  if (table === "bank_review_items" && !tables.bank_accounts.some((account) =>
    account.id === row.bank_account_id && account.owner_account_id === row.owner_account_id)) {
    throw new Error("bank review owner mismatch");
  }
  for (const keys of uniqueKeys[table] ?? []) {
    if (table === "rent_charges" && row.deleted_at) continue;
    if (table === "ownership_accounts" && (row.account_type !== "individual" || !row.created_by_profile_id)) continue;
    if (rows.some((other) => other !== row && keys.every((key) => other[key] === row[key]) &&
      (table !== "ownership_accounts" || other.account_type === "individual") &&
      (table !== "rent_charges" || !other.deleted_at) &&
      (table !== "inbox_threads" || row.entity_type === "tenant_profile" &&
        other.entity_type === "tenant_profile"))) {
      throw new Error(`duplicate ${table}: ${keys.join(",")}`);
    }
  }
}
export function createFakeAdmin(options = {}) {
  const tables = Object.fromEntries([...TABLES].map((name) => [name, clone(options.tables?.[name] ?? [])]));
  const calls = [];
  const objects = new Map(Object.entries(options.objects ?? {}));
  const users = clone(options.users ?? []);
  let sequence = 0;
  function track(kind, detail) {
    calls.push({ kind, ...clone(detail) });
    if ((kind === "write" || kind === "storage-write" || kind === "auth-write") &&
      !(options.allowedWrites ? options.allowedWrites.includes(detail.table ?? detail.op ?? "storage") :
        EXPECTED_WRITES.has(detail.table ?? detail.op ?? "storage"))) {
      throw new Error(`unexpected write: ${detail.table ?? detail.op ?? "storage"}`);
    }
    if (options.fail?.kind === kind && (!options.fail.table || options.fail.table === detail.table)) {
      return { message: options.fail.message ?? "injected error" };
    }
    return null;
  }
  function query(table) {
    if (!TABLES.has(table) || FORBIDDEN.has(table)) throw new Error(`unknown table: ${table}`);
    const state = { table, filters: [], limit: Infinity, op: "select", payload: null, invalidFilter: false };
    const addFilter = (key, value, predicate) => {
      if (invalidUuid(key, value)) state.invalidFilter = true;
      state.filters.push(predicate);
      return builder;
    };
    const builder = {
      select(columns = "*") { state.columns = columns; return builder; },
      eq(key, value) { return addFilter(key, value, (row) => row[key] === value); },
      neq(key, value) { return addFilter(key, value, (row) => row[key] !== value); },
      is(key, value) { return addFilter(key, value, (row) => row[key] === value || (value === null && row[key] == null)); },
      in(key, values) {
        if (values.some((value) => invalidUuid(key, value))) state.invalidFilter = true;
        state.filters.push((row) => values.includes(row[key]));
        return builder;
      },
      ilike(key, value) { return addFilter(key, value, (row) => String(row[key]).toLowerCase() === value.toLowerCase()); },
      limit(n) { state.limit = n; return builder; },
      insert(payload) { state.op = "insert"; state.payload = payload; return builder; },
      update(payload) { state.op = "update"; state.payload = payload; return builder; },
      delete() { state.op = "delete"; return builder; },
      single() { state.single = true; return builder.run(); },
      maybeSingle() { state.maybeSingle = true; return builder.run(); },
      then(resolve, reject) { return builder.run().then(resolve, reject); },
      async run() {
        if (state.invalidFilter || (state.payload &&
          (Array.isArray(state.payload) ? state.payload : [state.payload]).some((row) =>
            Object.entries(row).some(([key, value]) => invalidUuid(key, value))))) {
          return { data: null, error: uuidError };
        }
        const matches = tables[table].filter((row) => state.filters.every((filter) => filter(row))).slice(0, state.limit);
        const detail = { table, op: state.op, payload: state.payload, filters: state.filters.length };
        const error = track(state.op === "select" ? "read" : "write", detail);
        if (error) return { data: null, error };
        let result = matches;
        if (state.op === "insert") {
          const incoming = (Array.isArray(state.payload) ? state.payload : [state.payload]).map(clone);
          for (const row of incoming) {
            if (!row.id && !["ownership_account_members", "property_managers"].includes(table)) {
              row.id = deterministicUuid(`fake-${table}-${++sequence}`);
            }
            if (row.id && tables[table].some((other) => other.id === row.id)) {
              return { data: null, error: { code: "23505", message: "duplicate key value" } };
            }
            checkRow(table, row, tables[table], tables);
            tables[table].push(row);
          }
          result = incoming;
        } else if (state.op === "update") {
          for (const row of matches) {
            const merged = { ...row, ...clone(state.payload) };
            checkRow(table, merged, tables[table].filter((other) => other !== row), tables);
            Object.assign(row, merged);
          }
        } else if (state.op === "delete") {
          for (const row of matches) tables[table].splice(tables[table].indexOf(row), 1);
        }
        const selected = result.map((row) => clone(row));
        return { data: state.single || state.maybeSingle ? selected[0] ?? null : selected, error: null };
      }
    };
    return builder;
  }
  const authAdmin = {
    async listUsers() { const error = track("auth-read", {}); return { data: { users: clone(users) }, error }; },
    async createUser(payload) {
      if (payload.email_confirm !== true || !payload.user_metadata?.role || !payload.password ||
        !["owner", "tenant"].includes(payload.user_metadata.role) && !payload.user_metadata.smoke_seed ||
        Object.keys(payload).some((key) => !["email", "password", "email_confirm", "user_metadata", "app_metadata"].includes(key)) ||
        !validDemoMetadata(payload)) {
        throw new Error("invalid createUser payload");
      }
      const error = track("auth-write", { op: "createUser", payload });
      if (error) return { data: {}, error };
      const user = { id: deterministicUuid(`fake-user-${payload.email}`), ...clone(payload) };
      users.push(user);
      if (options.onCreateUser) options.onCreateUser({ user, tables });
      return { data: { user: clone(user) }, error: null };
    },
    async updateUserById(id, payload) {
      if (!payload.password || !payload.email_confirm || !payload.user_metadata ||
        Object.keys(payload).some((key) => !["password", "email_confirm", "user_metadata", "app_metadata"].includes(key)) ||
        !validDemoMetadata(payload)) {
        throw new Error("invalid update payload");
      }
      const error = track("auth-write", { op: "updateUserById", id, payload });
      if (error) return { data: {}, error };
      const user = users.find((item) => item.id === id);
      Object.assign(user, clone(payload));
      return { data: { user: clone(user) }, error: null };
    }
  };
  for (const method of ["inviteUserByEmail", "generateLink", "sendOtp", "resetPasswordForEmail"]) {
    authAdmin[method] = () => { throw new Error(`forbidden auth method ${method}`); };
  }
  const admin = {
    from: query, auth: { admin: authAdmin },
    rpc() { throw new Error("rpc forbidden"); },
    storage: { from(bucket) {
      if (bucket !== "maintenance-photos") throw new Error(`unknown bucket ${bucket}`);
      return {
        async list(folder, { search }) {
          const error = track("storage-read", { folder, search });
          const data = [...objects.keys()].filter((path) => path.startsWith(`${folder}/`))
            .map((path) => ({ name: path.slice(folder.length + 1) })).filter((item) => item.name.includes(search));
          return { data, error };
        },
        async upload(path, bytes, opts) {
          const error = track("storage-write", { path, contentType: opts.contentType, upsert: opts.upsert });
          if (error) return { data: null, error };
          if (objects.has(path) && opts.upsert === false) throw new Error("duplicate storage path");
          objects.set(path, Buffer.from(bytes));
          return { data: { path }, error: null };
        }
      };
    } }
  };
  return { admin, calls, tables, users, objects };
}
