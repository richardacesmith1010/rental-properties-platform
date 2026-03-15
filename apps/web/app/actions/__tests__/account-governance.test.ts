import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const getActiveMembersMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/ownership-members", () => ({ getActiveMembers: getActiveMembersMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  renameOwnershipAccountSchema: {},
  requestDeleteLlcSchema: {},
  voteOnAccountRenameSchema: {},
  voteOnDeleteLlcSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));

import {
  renameOwnershipAccount,
  requestDeleteLLC,
  voteOnAccountRename,
  voteOnDeleteLLC
} from "@/app/actions/account-governance";

interface OwnershipAccountState {
  id: string;
  account_type: "individual" | "llc";
  display_name: string;
}

interface OwnershipMemberState {
  account_id: string;
  profile_id: string;
  member_role: string;
  active: boolean;
}

interface RenameRequestState {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  proposed_name: string;
  current_name: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  votes_required: number;
  votes_received: number;
  resolved_at: string | null;
}

interface RenameVoteState {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

interface DeleteRequestState {
  id: string;
  ownership_account_id: string;
  requested_by: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  votes_required: number;
  votes_received: number;
  resolved_at: string | null;
}

interface DeleteVoteState {
  request_id: string;
  voter_id: string;
  vote: "approve" | "reject";
}

interface PropertyState {
  id: string;
  owner_account_id: string | null;
}

interface PaymentDistributionState {
  id: string;
  account_id: string;
}

interface GovernanceState {
  ownership_accounts: OwnershipAccountState[];
  ownership_account_members: OwnershipMemberState[];
  account_rename_requests: RenameRequestState[];
  account_rename_votes: RenameVoteState[];
  account_delete_requests: DeleteRequestState[];
  account_delete_votes: DeleteVoteState[];
  properties: PropertyState[];
  payment_distributions: PaymentDistributionState[];
}

type TableName = keyof GovernanceState;
type QueryExecutionResult = {
  data?: unknown;
  error: { code?: string; message?: string } | null;
};
type TableRow = Record<string, unknown>;

interface MockQueryBuilder extends PromiseLike<QueryExecutionResult> {
  eq(key: string, value: unknown): MockQueryBuilder;
  in(key: string, values: unknown[]): MockQueryBuilder;
  select(): MockQueryBuilder;
  maybeSingle(): Promise<QueryExecutionResult>;
  single(): Promise<QueryExecutionResult>;
  order(): MockQueryBuilder;
}

interface MockTableScope {
  select: (columns?: string) => MockQueryBuilder;
  insert: (payload: TableRow | TableRow[]) => MockQueryBuilder | Promise<QueryExecutionResult>;
  update: (payload: TableRow) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
}

interface MockSupabaseClient {
  from: (table: string) => MockTableScope;
}

type Filter =
  | { type: "eq"; key: string; value: unknown }
  | { type: "in"; key: string; values: unknown[] };

function cloneState(state?: Partial<GovernanceState>): GovernanceState {
  return {
    ownership_accounts: state?.ownership_accounts?.map((row) => ({ ...row })) ?? [],
    ownership_account_members: state?.ownership_account_members?.map((row) => ({ ...row })) ?? [],
    account_rename_requests: state?.account_rename_requests?.map((row) => ({ ...row })) ?? [],
    account_rename_votes: state?.account_rename_votes?.map((row) => ({ ...row })) ?? [],
    account_delete_requests: state?.account_delete_requests?.map((row) => ({ ...row })) ?? [],
    account_delete_votes: state?.account_delete_votes?.map((row) => ({ ...row })) ?? [],
    properties: state?.properties?.map((row) => ({ ...row })) ?? [],
    payment_distributions: state?.payment_distributions?.map((row) => ({ ...row })) ?? []
  };
}

function buildAdminClient(state: GovernanceState): MockSupabaseClient {
  let idCounter = 1;

  const applyFilters = (rows: TableRow[], filters: Filter[]) =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === "eq") {
          return row[filter.key] === filter.value;
        }
        return filter.values.includes(row[filter.key]);
      })
    );

  const createBuilder = (
    table: TableName,
    mode: "select" | "insert" | "update" | "delete",
    payload?: TableRow | TableRow[]
  ): MockQueryBuilder => {
    const filters: Filter[] = [];
    let shouldReturnRows = false;
    let executed = false;
    let executionResult: QueryExecutionResult = { error: null };

    const execute = (): Promise<QueryExecutionResult> => {
      if (executed) {
        return Promise.resolve(executionResult);
      }
      executed = true;

      const rows = state[table] as unknown as TableRow[];
      const matched = applyFilters(rows, filters);

      if (mode === "select") {
        executionResult = { data: matched, error: null };
        return Promise.resolve(executionResult);
      }

      if (mode === "insert") {
        const items = Array.isArray(payload) ? payload : [payload ?? {}];
        const inserted = items.map((item) => {
          const next = { ...item } as TableRow;
          if (!next.id) {
            next.id = `${table}-${idCounter++}`;
          }
          rows.push(next);
          return next;
        });
        executionResult = shouldReturnRows
          ? { data: inserted[0] ?? null, error: null }
          : { error: null };
        return Promise.resolve(executionResult);
      }

      if (mode === "update") {
        matched.forEach((row) => Object.assign(row, payload));
        executionResult = shouldReturnRows
          ? { data: matched[0] ?? null, error: null }
          : { error: null };
        return Promise.resolve(executionResult);
      }

      const remaining = rows.filter((row) => !matched.includes(row));
      const mutableState = state as unknown as Record<TableName, unknown>;
      mutableState[table] = remaining;

      if (table === "ownership_accounts") {
        const deletedAccountIds = matched.map((row) => String(row.id));
        state.account_rename_requests = state.account_rename_requests.filter(
          (row) => !deletedAccountIds.includes(row.ownership_account_id)
        );
        state.account_delete_requests = state.account_delete_requests.filter(
          (row) => !deletedAccountIds.includes(row.ownership_account_id)
        );
        state.account_rename_votes = state.account_rename_votes.filter(
          (row) => state.account_rename_requests.some((request) => request.id === row.request_id)
        );
        state.account_delete_votes = state.account_delete_votes.filter(
          (row) => state.account_delete_requests.some((request) => request.id === row.request_id)
        );
      }

      executionResult = shouldReturnRows
        ? { data: matched[0] ?? null, error: null }
        : { error: null };
      return Promise.resolve(executionResult);
    };

    const builder: MockQueryBuilder = {
      eq(key: string, value: unknown) {
        filters.push({ type: "eq", key, value });
        return builder;
      },
      in(key: string, values: unknown[]) {
        filters.push({ type: "in", key, values });
        return builder;
      },
      select() {
        shouldReturnRows = true;
        return builder;
      },
      maybeSingle() {
        return execute().then((result: QueryExecutionResult) => ({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
          error: result.error ?? null
        }));
      },
      single() {
        return execute().then((result: QueryExecutionResult) => ({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
          error: result.error ?? null
        }));
      },
      order() {
        return builder;
      },
      then<TResult1 = QueryExecutionResult, TResult2 = never>(
        onfulfilled?: ((value: QueryExecutionResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return execute().then(onfulfilled, onrejected);
      }
    };

    return builder;
  };

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => createBuilder(table as TableName, "select")),
      insert: vi.fn((payload: TableRow | TableRow[]) =>
        createBuilder(table as TableName, "insert", payload)
      ),
      update: vi.fn((payload: TableRow) => createBuilder(table as TableName, "update", payload)),
      delete: vi.fn(() => createBuilder(table as TableName, "delete"))
    }))
  };
}

describe("account governance actions", () => {
  let state: GovernanceState;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state = cloneState({
      ownership_accounts: [
        { id: "individual-1", account_type: "individual", display_name: "Courtney Account" },
        { id: "llc-1", account_type: "llc", display_name: "Atlas LLC" },
        { id: "llc-2", account_type: "llc", display_name: "Helios LLC" }
      ],
      ownership_account_members: [
        { account_id: "individual-1", profile_id: "user-1", member_role: "owner", active: true },
        { account_id: "llc-1", profile_id: "user-1", member_role: "owner", active: true },
        { account_id: "llc-2", profile_id: "user-1", member_role: "owner", active: true },
        { account_id: "llc-2", profile_id: "user-2", member_role: "member", active: true },
        { account_id: "llc-2", profile_id: "user-3", member_role: "member", active: true }
      ],
      properties: [
        { id: "property-1", owner_account_id: "llc-2" },
        { id: "property-2", owner_account_id: "llc-2" }
      ],
      payment_distributions: [{ id: "dist-1", account_id: "llc-2" }]
    });
    createAdminClientMock.mockImplementation(() => buildAdminClient(state));
    requireAuthMock.mockResolvedValue({ user: { id: "user-1", email: "owner@example.com" } });
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    getActiveMembersMock.mockImplementation(async (accountId: string) => ({
      members: state.ownership_account_members
        .filter((member) => member.account_id === accountId && member.active)
        .map((member) => ({ profileId: member.profile_id }))
    }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renames an individual account immediately", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "individual-1", newName: "Courtney Holdings" }
    });

    const result = await renameOwnershipAccount(null, new FormData());

    expect(result).toEqual({ success: true, message: "Account renamed." });
    expect(state.ownership_accounts.find((account) => account.id === "individual-1")?.display_name).toBe(
      "Courtney Holdings"
    );
  });

  it("renames a solo LLC immediately", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "llc-1", newName: "Atlas Holdings LLC" }
    });

    const result = await renameOwnershipAccount(null, new FormData());

    expect(result).toEqual({ success: true, message: "LLC account renamed." });
    expect(state.ownership_accounts.find((account) => account.id === "llc-1")?.display_name).toBe(
      "Atlas Holdings LLC"
    );
    expect(state.account_rename_requests).toHaveLength(0);
  });

  it("creates a pending rename request for a multi-member LLC", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "llc-2", newName: "Helios Ventures LLC" }
    });

    const result = await renameOwnershipAccount(null, new FormData());

    expect(result).toEqual({ success: true, message: "Rename request submitted for member approval." });
    expect(state.account_rename_requests).toHaveLength(1);
    expect(state.account_rename_requests[0]).toMatchObject({
      ownership_account_id: "llc-2",
      proposed_name: "Helios Ventures LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1
    });
    expect(state.account_rename_votes).toMatchObject([
      { request_id: state.account_rename_requests[0].id, voter_id: "user-1", vote: "approve" }
    ]);
  });

  it("approves a rename once quorum is reached", async () => {
    state.account_rename_requests.push({
      id: "rename-1",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      proposed_name: "Helios Ventures LLC",
      current_name: "Helios LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    state.account_rename_votes.push({ request_id: "rename-1", voter_id: "user-1", vote: "approve" });
    requireAuthMock.mockResolvedValueOnce({ user: { id: "user-2", email: "member@example.com" } });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { requestId: "rename-1", vote: "approve" }
    });

    const result = await voteOnAccountRename(null, new FormData());

    expect(result).toEqual({
      success: true,
      message: "Vote recorded. The account rename is now approved."
    });
    expect(state.ownership_accounts.find((account) => account.id === "llc-2")?.display_name).toBe(
      "Helios Ventures LLC"
    );
    expect(state.account_rename_requests[0].status).toBe("approved");
  });

  it("rejects a rename once quorum is reached", async () => {
    state.account_rename_requests.push({
      id: "rename-2",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      proposed_name: "Helios Ventures LLC",
      current_name: "Helios LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    state.account_rename_votes.push({ request_id: "rename-2", voter_id: "user-1", vote: "reject" });
    requireAuthMock.mockResolvedValueOnce({ user: { id: "user-2", email: "member@example.com" } });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { requestId: "rename-2", vote: "reject" }
    });

    const result = await voteOnAccountRename(null, new FormData());

    expect(result).toEqual({
      success: true,
      message: "Vote recorded. The account rename has been rejected."
    });
    expect(state.ownership_accounts.find((account) => account.id === "llc-2")?.display_name).toBe(
      "Helios LLC"
    );
    expect(state.account_rename_requests[0].status).toBe("rejected");
  });

  it("rejects duplicate rename votes", async () => {
    state.account_rename_requests.push({
      id: "rename-3",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      proposed_name: "Helios Ventures LLC",
      current_name: "Helios LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    state.account_rename_votes.push({ request_id: "rename-3", voter_id: "user-2", vote: "approve" });
    requireAuthMock.mockResolvedValueOnce({ user: { id: "user-2", email: "member@example.com" } });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { requestId: "rename-3", vote: "approve" }
    });
    createAdminClientMock.mockImplementationOnce(() => {
      const client = buildAdminClient(state);
      const originalFrom = client.from;
      client.from = vi.fn((table: string) => {
        const scoped = originalFrom(table);
        if (table === "account_rename_votes") {
          return {
            ...scoped,
            insert: vi.fn(() => Promise.resolve({ error: { code: "23505", message: "duplicate" } }))
          };
        }
        return scoped;
      });
      return client;
    });

    const result = await voteOnAccountRename(null, new FormData());

    expect(result).toEqual({ success: false, error: "You have already voted on this rename request." });
  });

  it("blocks non-members from voting on rename requests", async () => {
    state.account_rename_requests.push({
      id: "rename-4",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      proposed_name: "Helios Ventures LLC",
      current_name: "Helios LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    requireAuthMock.mockResolvedValueOnce({ user: { id: "user-9", email: "other@example.com" } });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { requestId: "rename-4", vote: "approve" }
    });

    const result = await voteOnAccountRename(null, new FormData());

    expect(result).toEqual({ success: false, error: "Access denied." });
  });

  it("creates a pending LLC delete request for a multi-member account", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "llc-2", reason: "Wind down the partnership" }
    });

    const result = await requestDeleteLLC(null, new FormData());

    expect(result).toEqual({ success: true, message: "Delete request submitted for member approval." });
    expect(state.account_delete_requests).toHaveLength(1);
    expect(state.account_delete_requests[0]).toMatchObject({
      ownership_account_id: "llc-2",
      reason: "Wind down the partnership",
      status: "pending",
      votes_required: 2,
      votes_received: 1
    });
  });

  it("approves LLC deletion, unlinks properties, and deletes the account", async () => {
    state.account_delete_requests.push({
      id: "delete-1",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      reason: "Close the entity",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    state.account_delete_votes.push({ request_id: "delete-1", voter_id: "user-1", vote: "approve" });
    requireAuthMock.mockResolvedValueOnce({ user: { id: "user-2", email: "member@example.com" } });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { requestId: "delete-1", vote: "approve" }
    });

    const result = await voteOnDeleteLLC(null, new FormData());

    expect(result).toEqual({
      success: true,
      message: "Vote recorded. The LLC account has been deleted."
    });
    expect(state.ownership_accounts.some((account) => account.id === "llc-2")).toBe(false);
    expect(state.ownership_account_members.some((member) => member.account_id === "llc-2")).toBe(false);
    expect(state.properties.every((property) => property.owner_account_id === null)).toBe(true);
    expect(state.payment_distributions).toHaveLength(0);
  });

  it("rejects deleting individual accounts", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "individual-1", reason: "Should not work" }
    });

    const result = await requestDeleteLLC(null, new FormData());

    expect(result).toEqual({ success: false, error: "Individual accounts cannot be deleted." });
  });

  it("rejects duplicate pending rename requests", async () => {
    state.account_rename_requests.push({
      id: "rename-5",
      ownership_account_id: "llc-2",
      requested_by: "user-1",
      proposed_name: "Helios Ventures LLC",
      current_name: "Helios LLC",
      status: "pending",
      votes_required: 2,
      votes_received: 1,
      resolved_at: null
    });
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { accountId: "llc-2", newName: "Another Name LLC" }
    });

    const result = await renameOwnershipAccount(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "A rename request is already pending for this LLC account."
    });
  });
});
