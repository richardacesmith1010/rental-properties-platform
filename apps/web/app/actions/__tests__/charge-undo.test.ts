import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => vi.fn());
const adminClient = vi.hoisted(() => vi.fn());
const permission = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());
const flags = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: adminClient }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: permission }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: limit }));
vi.mock("@/lib/notifications", () => ({ notifyPropertyTeam: vi.fn().mockResolvedValue(undefined),
  createNotificationWithDelivery: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/lease-collection", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/lease-collection")>(), getClientHomeFlags: flags
}));

import { undoManualPayment } from "@/app/actions/charge-undo";
import { recordManualPayment } from "@/app/actions/charges";
import { fileBankItem } from "@/lib/bank-feed/file-item";
import { handleCheckoutSessionCompleted } from "@/lib/stripe-webhook-handlers";
import { fakeAdmin } from "@/lib/__tests__/bank-feed-test-admin";

const chargeId = "550e8400-e29b-41d4-a716-446655440001";
const actorId = "550e8400-e29b-41d4-a716-446655440002";

function db(result: { code: string; reopened?: boolean; status?: string } = { code: "ok", reopened: true },
  options: { outside?: boolean; rpcError?: boolean; dueDate?: string } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: options.rpcError ? { message: "rpc failed" } : null });
  const from = vi.fn((table: string) => {
    const data = table === "rent_charges" ? { id: chargeId, lease_id: "lease", due_date: options.dueDate ?? "2026-10-15" }
      : table === "leases" ? { id: "lease", unit_id: "unit", grace_period_days: 5,
        collects_outside_domus: options.outside ?? false }
        : { id: "unit", property_id: "home" };
    const query = { select: () => query, eq: () => query, is: () => query,
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
    return query;
  });
  adminClient.mockReturnValue({ from, rpc });
  return { from, rpc };
}

describe("undoManualPayment", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: actorId }, role: "owner" });
    permission.mockResolvedValue(true);
    limit.mockReturnValue({ allowed: true });
    flags.mockResolvedValue(new Map());
    db();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  });

  it("D6 restores pending during the Denver evening grace day", async () => {
    const { rpc } = db({ code: "ok", reopened: true }, { dueDate: "2026-10-26" });
    vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
    expect(await undoManualPayment(chargeId)).toEqual({ success: true,
      message: "Payment undone. This rent is open again." });
    expect(rpc.mock.calls.at(-1)?.[1].p_restore_status).toEqual("pending");
  });

  it("reopens paid rent inside grace and refreshes three views", async () => {
    const { rpc } = db();
    expect(await undoManualPayment(chargeId)).toEqual({ success: true,
      message: "Payment undone. This rent is open again." });
    expect(rpc).toHaveBeenCalledWith("undo_manual_payment", {
      p_charge_id: chargeId, p_actor_id: actorId, p_restore_status: "pending"
    });
    expect(revalidate.mock.calls.map((call) => call[0])).toEqual(["/", "/owner", "/manager"]);
  });

  it("uses the late job's grace boundary and outside collection rule", async () => {
    const { rpc } = db();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    await undoManualPayment(chargeId);
    expect(rpc.mock.calls.at(-1)?.[1].p_restore_status).toBe("pending");
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    await undoManualPayment(chargeId);
    expect(rpc.mock.calls.at(-1)?.[1].p_restore_status).toBe("late");
    const outside = db(undefined, { outside: true });
    await undoManualPayment(chargeId);
    expect(outside.rpc.mock.calls.at(-1)?.[1].p_restore_status).toBe("pending");
  });

  it.each([
    [{ code: "ok", reopened: false, status: "paid" }, "Payment undone. Rent is still paid by another payment."],
    [{ code: "ok", reopened: false, status: "pending" }, "Payment undone. This rent is open again."],
    [{ code: "ok", reopened: false, status: "waived" }, "Payment undone."],
    [{ code: "stripe" }, "Undo this from where it was paid."],
    [{ code: "bank_feed" }, "Undo this from Bank."],
    [{ code: "legacy" }, "This payment is too old to undo here."],
    [{ code: "nothing_to_undo" }, "There is no payment to undo."],
    [{ code: "busy" }, "Someone else is saving this rent. Try again."],
    [{ code: "forbidden" }, "Access denied."]
  ])("maps database result %j to exact copy", async (result, message) => {
    db(result as { code: string; reopened?: boolean; status?: string });
    expect(await undoManualPayment(chargeId)).toEqual(result.code === "ok"
      ? { success: true, message } : { success: false, error: message });
  });

  it("blocks access before the RPC and handles rate and database failures", async () => {
    const client = db();
    permission.mockResolvedValueOnce(false);
    expect(await undoManualPayment(chargeId)).toEqual({ success: false, error: "Access denied." });
    expect(client.rpc).not.toHaveBeenCalled();
    limit.mockReturnValueOnce({ allowed: false });
    expect(await undoManualPayment(chargeId)).toMatchObject({ success: false,
      error: "Too many requests. Please try again later." });
    const broken = db({ code: "ok" }, { rpcError: true });
    expect(await undoManualPayment(chargeId)).toEqual({ success: false,
      error: "We could not undo this payment." });
    expect(broken.from).toHaveBeenCalledWith("rent_charges");
  });

  it("requires owner or manager before loading rent", async () => {
    auth.mockRejectedValueOnce(new Error("tenant redirected"));
    const client = db();
    await expect(undoManualPayment(chargeId)).rejects.toThrow("tenant redirected");
    expect(auth).toHaveBeenCalledWith("owner", "manager");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("records rent again after undo reopens it", async () => {
    let status = "pending";
    const inserts: Array<Record<string, unknown>> = [];
    const from = vi.fn((table: string) => {
      const data = table === "rent_charges" ? { id: chargeId, lease_id: "lease", due_date: "2026-10-15",
        status, amount_cents: 100000 }
        : table === "leases" ? { id: "lease", unit_id: "unit", tenant_profile_id: null,
          grace_period_days: 5, collects_outside_domus: false }
          : { id: "unit", property_id: "home", unit_number: "1" };
      const query = { select: () => query, eq: () => query, is: () => query,
        maybeSingle: vi.fn().mockImplementation(async () => ({ data: table === "rent_charges"
          ? { ...data, status } : data, error: null })) };
      if (table === "rent_charges") return { ...query, update: () => ({ in: () => ({ eq: async () => {
        status = "paid"; return { error: null };
      } }) }) };
      if (table === "payments") return { insert: async (row: Record<string, unknown>) => {
        inserts.push(row); return { error: null };
      } };
      return query;
    });
    const rpc = vi.fn().mockImplementation(async () => {
      status = "pending";
      return { data: { code: "ok", reopened: true, status }, error: null };
    });
    adminClient.mockReturnValue({ from, rpc });
    const form = new FormData();
    form.set("chargeId", chargeId);
    form.set("amountDollars", "1000");
    form.set("method", "cash");
    form.set("referenceNote", "");
    expect(await recordManualPayment(null, form)).toMatchObject({ success: true });
    expect(status).toBe("paid");
    expect(await undoManualPayment(chargeId)).toMatchObject({ success: true });
    expect(status).toBe("pending");
    expect(await recordManualPayment(null, form)).toMatchObject({ success: true });
    expect(status).toBe("paid");
    expect(inserts).toHaveLength(2);
    expect(inserts.every((row) => row.recorded_via === "manual")).toBe(true);
  });

  it("bank filing tags its payment and does not claim paid rent", async () => {
    const admin = fakeAdmin({ rent_charges: [{ id: "rent", status: "pending" }],
      payments: [], bank_transactions: [] });
    const charge = { id: "rent", lease_id: "lease", property_id: "home", amount_cents: 100000,
      status: "pending" };
    const ctx = { admin: admin as never, userId: "owner", bankAccountId: "bank", nickname: "Checking",
      row: { i: 0, postedOn: "2026-10-15", amountCents: 100000, direction: "in" as const,
        description: "Deposit", occurrenceIndex: 0, fingerprint: "a".repeat(64) }, matchedBy: "owner" as const };
    expect((await fileBankItem(ctx, { kind: "rent", rentChargeId: "rent" }, charge)).success).toBe(true);
    expect(admin.tables.payments[0].recorded_via).toBe("bank_feed");
    const count = admin.tables.payments.length;
    const paidCtx = { ...ctx, row: { ...ctx.row, fingerprint: "b".repeat(64) } };
    expect(await fileBankItem(paidCtx, { kind: "rent", rentChargeId: "rent" }, { ...charge, status: "paid" }))
      .toMatchObject({ success: true, createdRecord: false });
    expect(admin.tables.payments).toHaveLength(count);
  });

  it("Stripe tags the payment before marking rent paid", async () => {
    const admin = fakeAdmin({
      rent_charges: [{ id: "rent", lease_id: "lease", status: "pending", due_date: "2026-10-15",
        amount_cents: 100000 }],
      leases: [{ id: "lease", tenant_profile_id: "tenant", unit_id: "unit", collects_outside_domus: false }],
      units: [{ id: "unit", property_id: "home", unit_number: "1" }],
      properties: [{ id: "home", owner_account_id: null, name: "Test Home" }],
      profiles: [{ id: "tenant", email: "tenant@example.invalid" }],
      property_managers: [], payments: []
    });
    await handleCheckoutSessionCompleted(admin as never, {
      id: "session", url: null, payment_status: "paid", amount_total: 100000, payment_intent: "intent",
      metadata: { charge_id: "rent", user_id: "tenant", payment_method: "card",
        transfer_mode: "destination", base_amount_cents: "100000" }
    });
    expect(admin.tables.payments[0].recorded_via).toBe("stripe");
    expect(admin.tables.rent_charges[0].status).toBe("paid");
    expect(admin.writes.findIndex((write) => write.table === "payments" && write.op === "insert"))
      .toBeLessThan(admin.writes.findIndex((write) => write.table === "rent_charges" && write.op === "update"));
  });
});
