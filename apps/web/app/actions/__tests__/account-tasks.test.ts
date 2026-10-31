vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: async () => ({}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), access: vi.fn(), getUser: vi.fn(), from: vi.fn(),
  reads: new Map<string, unknown>(), mutations: [] as Array<{ table: string; kind: string; value: unknown }> }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: mocks.role }));
vi.mock("@/lib/partners", () => ({ checkPartnerAccess: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
import { addTask, updateTask, removeTask, markTaskDone, addCommonTasks } from "@/app/actions/account-tasks";
const accountId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const partnerId = "00000000-0000-4000-8000-000000000003";
const input = { accountId, title: "Pay the mortgage", frequency: "monthly" as const,
  nextDueOn: "2026-10-13", ownerPartnerId: null };
function query(table: string) {
  let kind = "read";
  const q = { select: () => q, eq: () => q, maybeSingle: async () => mocks.reads.get(`${table}:${kind}`) ?? mocks.reads.get(table)
      ?? { data: { id: taskId }, error: null },
    insert: (value: unknown) => { kind = "insert"; mocks.mutations.push({ table, kind, value }); return q; },
    update: (value: unknown) => { kind = "update"; mocks.mutations.push({ table, kind, value }); return q; },
    then: (resolve: (value: unknown) => void) => Promise.resolve(mocks.reads.get(`${table}:${kind}`)
      ?? mocks.reads.get(table) ?? { data: [], error: null }).then(resolve) };
  return q;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.reads.clear(); mocks.mutations.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: { id: accountId } }, error: null });
  mocks.role.mockResolvedValue("owner");
  mocks.from.mockImplementation(query);
  mocks.access.mockImplementation(async () => ({ ok: true, data: { from: mocks.from } }));
});
describe("account task actions", () => {
  it("rejects a tenant, manager, non-member and personal account", async () => {
    for (const role of ["tenant", "manager"]) {
      mocks.role.mockResolvedValueOnce(role);
      expect((await addTask(input)).ok).toBe(false);
    }
    mocks.access.mockResolvedValueOnce({ ok: false, error: "not_allowed" });
    expect((await addTask(input)).ok).toBe(false);
    mocks.access.mockResolvedValueOnce({ ok: false, error: "not_allowed" });
    expect((await addTask(input)).ok).toBe(false);
    expect(mocks.mutations).toHaveLength(0);
  });
  it("requires an active owner partner of the same account", async () => {
    mocks.reads.set("account_partners", { data: null, error: null });
    expect((await addTask({ ...input, ownerPartnerId: partnerId })).ok).toBe(false);
    expect(mocks.mutations).toHaveLength(0);
  });
  it("marks done without writing the trigger-owned profile column", async () => {
    mocks.reads.set("account_tasks", { data: { account_id: accountId, frequency: "monthly",
      next_due_on: "2026-01-31", active: true }, error: null });
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    try {
      expect((await markTaskDone(taskId)).ok).toBe(true);
      const update = mocks.mutations.find((row) => row.kind === "update")?.value;
      expect(update).toEqual({ last_done_on: "2026-10-13", next_due_on: "2026-10-31" });
      expect(update).not.toHaveProperty("last_done_by_profile_id");
    } finally { vi.useRealTimers(); }
  });
  it("inserts all twelve common tasks in one call when empty", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    try {
      expect((await addCommonTasks(accountId)).ok).toBe(true);
      expect(mocks.mutations).toHaveLength(1);
      expect((mocks.mutations[0].value as unknown[])).toHaveLength(12);
    } finally { vi.useRealTimers(); }
  });
  it("inserts the starter list in one call and skips titles case-insensitively", async () => {
    mocks.reads.set("account_tasks", { data: [{ title: " PAY VENDORS " }], error: null });
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    try {
      expect((await addCommonTasks(accountId)).ok).toBe(true);
      expect(mocks.mutations).toHaveLength(1);
      const rows = mocks.mutations[0].value as Array<{ title: string; next_due_on: string | null }>;
      expect(rows).toHaveLength(11);
      expect(rows.find((row) => row.title === "Pay the mortgage")?.next_due_on).toBe("2026-11-01");
      expect(rows.find((row) => row.title === "Prepare the lease")?.next_due_on).toBe("2027-01-31");
      expect(rows.some((row) => row.title === "Pay vendors")).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("deactivates on Remove and checks mutation errors", async () => {
    expect((await removeTask(accountId, taskId)).ok).toBe(true);
    expect(mocks.mutations[0].value).toEqual({ active: false });
    mocks.reads.set("account_tasks:update", { data: null, error: { code: "42P01" } });
    expect((await updateTask({ ...input, taskId })).ok).toBe(false);
  });
});
