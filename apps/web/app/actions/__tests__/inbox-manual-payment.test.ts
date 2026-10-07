import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/notifications", () => ({ createNotificationWithDelivery: createNotificationWithDeliveryMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  requestManualPaymentConfirmationSchema: {}, parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({ ensureCapabilityEnabled: ensureCapabilityEnabledMock }));

import { requestManualPaymentConfirmation } from "@/app/actions/inbox-manual-payment";

const homeA = "11111111-1111-4111-8111-111111111111";

type ReportFixture = {
  owner?: string;
  status?: string;
  reportedAt?: string | null;
  afterClaimStatus?: string;
  deletedAfterClaim?: boolean;
  missingAfterClaim?: boolean;
  claimError?: boolean;
  rereadError?: boolean;
  messageError?: boolean;
  noThread?: boolean;
  forceEmptyClaim?: boolean;
};

function reportDb(fixture: ReportFixture = {}) {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  let reportedAt = fixture.reportedAt ?? null;
  let readCount = 0;
  const rows: Record<string, Record<string, unknown> | Array<Record<string, unknown>> | null> = {
    leases: { id: "lease-1", tenant_profile_id: fixture.owner ?? "tenant-1", unit_id: "unit-1" },
    units: { property_id: homeA, unit_number: "1A" },
    profiles: { full_name: "Taylor Tenant", email: "tenant@example.com" },
    properties: { name: "Atlas House", owner_account_id: null },
    inbox_threads: fixture.noThread ? null : { id: "thread-1" }
  };
  const from = (table: string) => {
    let operation = "read";
    let payload: Record<string, unknown> = {};
    const result = () => {
      if (table === "rent_charges" && operation === "update") {
        calls.push("claim");
        updates.push(payload);
        if (fixture.claimError) return { data: null, error: { code: "ERROR" } };
        if (fixture.forceEmptyClaim || reportedAt || fixture.status === "paid") return { data: [], error: null };
        reportedAt = payload.tenant_reported_paid_at as string;
        return { data: [{ id: "charge-1" }], error: null };
      }
      if (table === "rent_charges") {
        readCount += 1;
        calls.push(readCount === 1 ? "first_read" : "reread");
        if (readCount > 1 && fixture.rereadError) return { data: null, error: { code: "ERROR" } };
        const data = readCount > 1 && fixture.missingAfterClaim ? null : {
          id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01", amount_cents: 100,
          status: readCount > 1 ? fixture.afterClaimStatus ?? fixture.status ?? "late" : fixture.status ?? "late",
          tenant_reported_paid_at: reportedAt,
          deleted_at: readCount > 1 && fixture.deletedAfterClaim ? "2026-10-07" : null
        };
        return { data, error: null };
      }
      if (table === "leases") calls.push("ownership_read");
      if (table === "inbox_messages") {
        calls.push("message");
        return { data: null, error: fixture.messageError ? { code: "ERROR" } : null };
      }
      if (table === "inbox_threads" && operation === "insert") {
        calls.push("thread");
        return { data: fixture.noThread ? null : { id: "thread-1" }, error: null };
      }
      if (table === "inbox_threads" && operation === "update") return { data: null, error: null };
      return { data: rows[table] ?? [], error: null };
    };
    const query = {
      select: () => query,
      eq: () => query,
      is: (column: string, value: unknown) => {
        if (table === "rent_charges") calls.push(`is:${column}:${value}`);
        return query;
      },
      in: (column: string, values: string[]) => {
        if (table === "rent_charges") calls.push(`in:${column}:${values.join(",")}`);
        return query;
      },
      limit: () => query,
      maybeSingle: async () => result(),
      single: async () => result(),
      insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return query; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return query; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  };
  createAdminClientMock.mockReturnValue({ from });
  requireAuthMock.mockResolvedValue({ user: { id: "tenant-1", email: "tenant@example.com" } });
  parseFormDataMock.mockReturnValue({ success: true, data: { chargeId: "charge-1" } });
  return { calls, updates };
}

describe("manual payment report claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
  });

  it("claims an open charge before creating one owner message", async () => {
    const db = reportDb();
    expect(await requestManualPaymentConfirmation(null, new FormData())).toMatchObject({ success: true });
    expect(db.calls).toContain("is:tenant_reported_paid_at:null");
    expect(db.calls).toContain("is:deleted_at:null");
    expect(db.calls).toContain("in:status:pending,late");
    expect(db.calls.indexOf("ownership_read")).toBeLessThan(db.calls.indexOf("claim"));
    expect(db.calls.indexOf("claim")).toBeLessThan(db.calls.indexOf("message"));
    expect(db.calls.filter((call) => call === "message")).toHaveLength(1);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].tenant_reported_paid_at).toEqual(expect.any(String));
  });

  it.each([
    [{ forceEmptyClaim: true, reportedAt: "2026-10-07T17:04:35Z" },
      { success: true, message: "Already sent. Your landlord will check and mark it paid." }],
    [{ forceEmptyClaim: true, afterClaimStatus: "paid" },
      { success: false, error: "This payment is already closed." }],
    [{ forceEmptyClaim: true, missingAfterClaim: true },
      { success: false, error: "Payment not found." }],
    [{ forceEmptyClaim: true, deletedAfterClaim: true },
      { success: false, error: "Payment not found." }],
    [{ forceEmptyClaim: true, rereadError: true },
      { success: false, error: "Could not send. Please try again." }]
  ] as const)("classifies a zero-row claim from the charge re-read %#", async (fixture, expected) => {
    const db = reportDb({ ...fixture });
    expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual(expected);
    expect(db.calls.indexOf("ownership_read")).toBeLessThan(db.calls.indexOf("reread"));
    expect(db.calls).not.toContain("message");
    expect(db.calls).not.toContain("thread");
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(db.updates.every((update) => update.tenant_reported_paid_at !== null)).toBe(true);
  });

  it("logs contention when an open charge stays unreported", async () => {
    const db = reportDb({ forceEmptyClaim: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual({
        success: false, error: "Could not send. Please try again."
      });
      expect(JSON.stringify(log.mock.calls)).toContain("tenant_report_claim_contention");
      expect(db.calls).not.toContain("message");
    } finally {
      log.mockRestore();
    }
  });

  it("accepts two concurrent reports with one message", async () => {
    const db = reportDb();
    const results = await Promise.all([
      requestManualPaymentConfirmation(null, new FormData()),
      requestManualPaymentConfirmation(null, new FormData())
    ]);
    expect(results).toEqual([
      { success: true, message: "Manual payment request sent to your landlord for confirmation." },
      { success: true, message: "Already sent. Your landlord will check and mark it paid." }
    ]);
    expect(db.calls.filter((call) => call === "message")).toHaveLength(1);
    expect(db.updates.every((update) => update.tenant_reported_paid_at !== null)).toBe(true);
  });

  it("keeps the claim when a concurrent message insert fails", async () => {
    const db = reportDb({ messageError: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const results = await Promise.all([
        requestManualPaymentConfirmation(null, new FormData()),
        requestManualPaymentConfirmation(null, new FormData())
      ]);
      expect(results.map((result) => result?.success)).toEqual([true, true]);
      expect(results[0]).toEqual({ success: true, message: "Sent. Your landlord will check and mark it paid." });
      expect(results[1]).toEqual({
        success: true, message: "Already sent. Your landlord will check and mark it paid."
      });
      expect(db.calls.filter((call) => call === "message")).toHaveLength(1);
      expect(db.updates).toHaveLength(2);
      expect(db.updates.every((update) => update.tenant_reported_paid_at !== null)).toBe(true);
      expect(JSON.stringify(log.mock.calls)).toContain("insert_message");
      expect(revalidatePathMock).toHaveBeenCalledWith("/tenant");
      expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
      expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("keeps the claim when no owner thread is created", async () => {
    const db = reportDb({ noThread: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual({
        success: true, message: "Sent. Your landlord will check and mark it paid."
      });
      expect(db.calls).not.toContain("message");
      expect(db.updates).toHaveLength(1);
      expect(db.updates[0].tenant_reported_paid_at).not.toBeNull();
      expect(JSON.stringify(log.mock.calls)).toContain("create_thread");
      expect(revalidatePathMock).toHaveBeenCalledWith("/tenant");
      expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
      expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each(["paid", "late"])("does not claim another tenant's %s charge", async (status) => {
    const db = reportDb({ owner: "other-tenant", status, reportedAt: "2026-10-07T17:04:35Z" });
    expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual({
      success: false, error: "You do not have access to this payment."
    });
    expect(db.updates).toEqual([]);
    expect(db.calls).not.toContain("claim");
  });

  it("rejects an owned closed charge without a claim", async () => {
    const db = reportDb({ status: "paid" });
    expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual({
      success: false, error: "This payment is already closed."
    });
    expect(db.updates).toEqual([]);
  });

  it("stops before messages when the claim errors", async () => {
    const db = reportDb({ claimError: true });
    expect(await requestManualPaymentConfirmation(null, new FormData())).toEqual({
      success: false, error: "Could not send. Please try again."
    });
    expect(db.calls).not.toContain("message");
    expect(db.updates.every((update) => update.tenant_reported_paid_at !== null)).toBe(true);
  });

});
