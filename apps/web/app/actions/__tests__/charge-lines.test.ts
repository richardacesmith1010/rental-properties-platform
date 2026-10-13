import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const canAdmin = vi.hoisted(() => vi.fn());
const createAdmin = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdmin }));

import { addNextBillLine, removeNextBillLine, billTenantForExpense } from "@/app/actions/charge-lines";
import { createNextBillLineSchema } from "@/lib/validations-payment";

const leaseId = "00000000-0000-4000-8000-000000000001";
const lineId = "00000000-0000-4000-8000-000000000002";
const expenseId = "00000000-0000-4000-8000-000000000003";
let rpc: ReturnType<typeof vi.fn>;
let audit: ReturnType<typeof vi.fn>;
let line: { id: string; lease_id: string; charge_id: string | null } | null;
let expense: { id: string; property_id: string; category: string; description: string; amount_cents: number } | null;
let activeLeases: Array<{ id: string }>;

function client() {
  rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({
    data: name === "add_rent_charge_line" ? lineId : null, error: null
  }));
  audit = vi.fn(async () => ({ error: null }));
  return { rpc, from: vi.fn((table: string) => {
    if (table === "audit_logs") return { insert: audit };
    if (table === "leases") return { select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { id: leaseId, unit_id: "unit", monthly_rent_cents: 216000 }, error: null }) }),
      in: () => ({ eq: async () => ({ data: activeLeases, error: null }) })
    }) };
    if (table === "units") return { select: () => ({
      eq: async () => ({ data: [{ id: "unit", property_id: "property" }], error: null }),
      maybeSingle: async () => ({ data: { property_id: "property" }, error: null })
    }) };
    if (table === "property_expenses") return { select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: expense, error: null })
    }) }) };
    if (table === "rent_charge_lines") return { select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: line, error: null })
    }) }) };
    throw new Error(`Unexpected ${table}`);
  }) };
}

// The fake follows the action's canonical lease -> unit -> property lookup.
function workingClient() {
  const value = client();
  const original = value.from;
  value.from = vi.fn((table: string) => {
    if (table === "units") return { select: () => ({ eq: (column: string) => column === "id"
      ? { maybeSingle: async () => ({ data: { property_id: "property" }, error: null }) }
      : Promise.resolve({ data: [{ id: "unit" }], error: null }) }) };
    return original(table);
  }) as typeof value.from;
  return value;
}

describe("next bill actions §8.1-2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: "owner" }, role: "owner" });
    canAdmin.mockResolvedValue(true);
    line = { id: lineId, lease_id: leaseId, charge_id: null };
    expense = { id: expenseId, property_id: "property", category: "utility",
      description: "City water bill", amount_cents: 11259 };
    activeLeases = [{ id: leaseId }];
    createAdmin.mockImplementation(workingClient);
  });

  it("adds an unattached line through the RPC with actor and audit; never edits a charge", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    const result = await addNextBillLine({ leaseId, kind: "utility", label: "Water", amountCents: 11259 });
    expect(result).toMatchObject({ ok: true, lineId });
    expect(admin.rpc).toHaveBeenCalledWith("add_rent_charge_line", expect.objectContaining({
      p_lease_id: leaseId, p_actor_profile_id: "owner", p_source_expense_id: null
    }));
    expect(admin.from).not.toHaveBeenCalledWith("rent_charges");
    expect(admin.from).toHaveBeenCalledWith("audit_logs");
  });

  it("retries the same expense with the same source id and line id", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    const first = await billTenantForExpense(expenseId);
    const second = await billTenantForExpense(expenseId);
    expect(first).toMatchObject({ ok: true, lineId });
    expect(second).toMatchObject({ ok: true, lineId });
    expect(admin.rpc).toHaveBeenCalledTimes(2);
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "add_rent_charge_line",
      expect.objectContaining({ p_source_expense_id: expenseId }));
  });

  it("rejects a credit at or above rent and rejects unrelated owners", async () => {
    expect(await addNextBillLine({ leaseId, kind: "credit", label: "Credit", amountCents: 216000 }))
      .toEqual({ ok: false, error: "That credit is bigger than the rent." });
    canAdmin.mockResolvedValue(false);
    expect(await addNextBillLine({ leaseId, kind: "utility", label: "Water", amountCents: 1 }))
      .toEqual({ ok: false, error: "Access denied." });
  });

  it("returns a database error with ok false", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    admin.rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    expect((await addNextBillLine({ leaseId, kind: "utility", label: "Water", amountCents: 1 })).ok)
      .toBe(false);
  });

  it("succeeds and logs when add audit fails", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    admin.from = vi.fn((table: string) => table === "audit_logs"
      ? { insert: async () => ({ error: { message: "audit down" } }) }
      : workingClient().from(table)) as typeof admin.from;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await addNextBillLine({ leaseId, kind: "utility", label: "Water", amountCents: 1 }))
      .toMatchObject({ ok: true, auditWarning: true });
    expect(spy).toHaveBeenCalledWith("[charge-line-audit-failed]", expect.anything());
    spy.mockRestore();
  });

  it("only removes unattached lines and checks canonical property", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    expect((await removeNextBillLine(lineId)).ok).toBe(true);
    line = { id: lineId, lease_id: leaseId, charge_id: "charge" };
    expect(await removeNextBillLine(lineId)).toEqual({ ok: false,
      error: "This line is already on a bill. Add a credit to the next bill instead." });
    line.charge_id = null;
    canAdmin.mockResolvedValue(false);
    expect(await removeNextBillLine(lineId)).toEqual({ ok: false, error: "Access denied." });
  });

  it("succeeds and logs when remove audit fails", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    const original = admin.from;
    admin.from = vi.fn((table: string) => table === "audit_logs"
      ? { insert: async () => ({ error: { message: "audit down" } }) }
      : original(table)) as typeof admin.from;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await removeNextBillLine(lineId)).toMatchObject({ ok: true, auditWarning: true });
    expect(spy).toHaveBeenCalledWith("[charge-line-audit-failed]", expect.anything());
    spy.mockRestore();
  });

  it("requires an owner or manager before touching a line", async () => {
    requireAuth.mockRejectedValue(new Error("Unauthorized tenant"));
    await expect(addNextBillLine({ leaseId, kind: "utility", label: "Water", amountCents: 1 }))
      .rejects.toThrow("Unauthorized tenant");
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it("validates utility bill, active lease count, and source expense id", async () => {
    const admin = workingClient(); createAdmin.mockReturnValue(admin);
    expect((await billTenantForExpense(expenseId)).ok).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("add_rent_charge_line", expect.objectContaining({
      p_source_expense_id: expenseId, p_label: "Water", p_actor_profile_id: "owner"
    }));
    expense!.category = "repair";
    expect((await billTenantForExpense(expenseId)).ok).toBe(false);
    expense!.category = "utility"; activeLeases = [];
    expect(await billTenantForExpense(expenseId)).toEqual({ ok: false, error: "This home has no active lease." });
    activeLeases = [{ id: leaseId }, { id: lineId }];
    expect(await billTenantForExpense(expenseId)).toEqual({ ok: false,
      error: "This home has more than one lease. Use Add to next bill on the Rent list." });
  });

  it("does not accept sourceExpenseId from the client line schema", () => {
    expect(createNextBillLineSchema.parse({ leaseId, kind: "utility", label: "Water",
      amountCents: 100, sourceExpenseId: expenseId })).not.toHaveProperty("sourceExpenseId");
  });
});
