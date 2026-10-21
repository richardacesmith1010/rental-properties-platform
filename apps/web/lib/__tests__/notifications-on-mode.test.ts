import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const createAdminClientMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
import { createNotificationWithDelivery } from "@/lib/notifications";
type Row = Record<string, unknown>;
function makeStore() {
  const profiles = new Map<string, Row>([["tenant-1", {
    id: "tenant-1", email: "tenant@example.com", role: "tenant",
    notification_preferences: {}, notifications_paused_until: null
  }]]);
  const notifications = new Map<string, Row>();
  const deliveries: Row[] = [];
  let missingClaimColumn = false;
  let missingRecordColumn = false;
  let loseRecordClaim = false;
  const from = vi.fn((table: string) => {
    let filters: Array<(row: Row) => boolean> = [];
    let mutation: Row | null = null;
    let operation: "select" | "insert" | "update" | "upsert" = "select";
    const matches = (row: Row) => filters.every((filter) => filter(row));
    const source = () => table === "profiles" ? [...profiles.values()]
      : table === "notifications" ? [...notifications.values()] : deliveries;
    const execute = () => {
      if (operation === "upsert") {
        const row = mutation!;
        const key = [row.recipient_profile_id, row.type, row.entity_type, row.entity_id].join(":");
        const prior = notifications.get(key);
        const updated = { ...prior, ...row, id: prior?.id ?? `notification-${notifications.size + 1}` };
        notifications.set(key, updated);
        return { data: [updated], error: null };
      }
      if (operation === "insert") {
        const row = mutation!;
        if (row.channel === "email" && missingClaimColumn) return { data: null, error: { code: "42703" } };
        if (row.channel === "email" && deliveries.some((existing) =>
          existing.notification_id === row.notification_id && existing.channel === "email" &&
          (existing.email_key ?? null) === (row.email_key ?? null))) {
          return { data: null, error: { code: "23505" } };
        }
        const inserted = { ...row, id: `delivery-${deliveries.length + 1}` };
        deliveries.push(inserted);
        return { data: [inserted], error: null };
      }
      if (operation === "update") {
        if (missingRecordColumn && mutation && "provider_ref" in mutation) {
          return { data: null, error: { code: "42703" } };
        }
        const rows = source().filter(matches);
        if (loseRecordClaim && mutation && "provider_ref" in mutation) {
          rows.forEach((row) => { row.status = "sent"; row.claim_token = "other-worker"; });
          return { data: [], error: null };
        }
        rows.forEach((row) => Object.assign(row, mutation));
        return { data: rows, error: null };
      }
      return { data: source().filter(matches), error: null };
    };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      }),
      insert: vi.fn((row: Row) => { operation = "insert"; mutation = row; return builder; }),
      upsert: vi.fn((row: Row) => { operation = "upsert"; mutation = row; return builder; }),
      update: vi.fn((row: Row) => { operation = "update"; mutation = row; return builder; }),
      single: vi.fn(async () => {
        const result = execute();
        return { data: result.data?.[0] ?? null, error: result.error };
      }),
      maybeSingle: vi.fn(async () => {
        const result = execute();
        return { data: result.data?.[0] ?? null, error: result.error };
      }),
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve)
    };
    return builder;
  });
  return {
    admin: { from } as unknown as SupabaseClient, from, profiles, notifications, deliveries,
    setMissingClaim: (value: boolean) => { missingClaimColumn = value; },
    setMissingRecord: (value: boolean) => { missingRecordColumn = value; },
    setLoseRecord: (value: boolean) => { loseRecordClaim = value; }
  };
}
const params = {
  recipientProfileId: "tenant-1", type: "late_rent" as const, title: "Rent late", body: "Please pay.",
  entityType: "rent_charge", entityId: "charge-1", recipientRole: "tenant" as const
};
function sentResponse() {
  return { ok: true, status: 200, json: async () => ({ id: "resend-1" }) };
}
function noResend(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock).not.toHaveBeenCalled();
}
describe("notifications on mode delivery claims", () => {
  let store: ReturnType<typeof makeStore>;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    fetchMock = vi.fn().mockResolvedValue(sentResponse());
    vi.stubGlobal("fetch", fetchMock);
    store = makeStore();
    createAdminClientMock.mockReturnValue(store.admin);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("N5 looks up the canonical email once in on mode and records a missing address", async () => {
    const sent = await createNotificationWithDelivery(params);
    expect(sent).toEqual({ inApp: { status: "sent" }, email: { status: "sent" } });
    expect(store.from.mock.calls.filter(([table]) => table === "profiles")).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual(["tenant@example.com"]);
    store.profiles.get("tenant-1")!.email = null;
    const failed = await createNotificationWithDelivery({ ...params, emailKey: "missing" });
    expect(failed.email).toEqual({ status: "failed" });
    expect(store.deliveries.at(-1)?.error_message).toEqual("Recipient email missing.");
  });
  it.each([undefined, "overdue-60"])("N6c and N7 serialize concurrent claims for key %s", async (emailKey) => {
    const results = await Promise.all([
      createNotificationWithDelivery({ ...params, emailKey }),
      createNotificationWithDelivery({ ...params, emailKey })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.deliveries.filter((row) => row.channel === "email")).toHaveLength(1);
    expect(results.map((result) => result.email)).toEqual([
      { status: "sent" }, { status: "skipped", reason: "duplicate" }
    ]);
  });
  it("N6r lets one worker reclaim a failed row", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Bad request" }) });
    await createNotificationWithDelivery(params);
    fetchMock.mockClear();
    const results = await Promise.all([createNotificationWithDelivery(params), createNotificationWithDelivery(params)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.email)).toEqual([
      { status: "sent" }, { status: "skipped", reason: "duplicate" }
    ]);
  });
  it.each([
    [{ delinquency_escalation: false }, null, "preferences"],
    [{}, "9999-12-31T23:59:59Z", "paused"]
  ] as const)("N3 overdue keeps in-app delivery when tenant email is blocked: %s", async (
    preferences, pausedUntil, reason
  ) => {
    const profile = store.profiles.get("tenant-1")!;
    profile.notification_preferences = preferences;
    profile.notifications_paused_until = pausedUntil;

    const result = await createNotificationWithDelivery({
      ...params, type: "delinquency_escalation", emailKey: "overdue-30"
    });

    expect(result).toEqual({ inApp: { status: "sent" }, email: { status: "skipped", reason } });
    expect(store.deliveries.filter((row) => row.channel === "in_app")).toHaveLength(1);
    expect(store.deliveries.filter((row) => row.channel === "email")).toHaveLength(0);
    noResend(fetchMock);
  });
  it("N6r reclaims a definitive legacy failure with the newly stored request body", async () => {
    const notificationId = "notification-1";
    store.deliveries.push({
      id: "legacy-1", notification_id: notificationId, channel: "email", email_key: null,
      status: "failed", claim_token: null, first_attempt_at: null, email_request_body: null,
      error_message: "Resend error 422"
    });

    const result = await createNotificationWithDelivery(params);
    const row = store.deliveries[0];
    const fetchBody = fetchMock.mock.calls[0][1].body as string;

    expect(result.email).toEqual({ status: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchBody)).toEqual({
      from: "alerts@domusbase.com", to: ["tenant@example.com"],
      subject: "Rent late", html: expect.any(String), text: expect.any(String)
    });
    expect(row.status).toEqual("sent");
    expect(row.email_request_body).toBe(fetchBody);
    expect(row.first_attempt_at).toEqual("2026-10-20T12:00:00.000Z");
  });
  it("N6d leaves a legacy unknown-result row terminal without a stored body", async () => {
    store.deliveries.push({
      id: "legacy-1", notification_id: "notification-1", channel: "email", email_key: null,
      status: "failed", claim_token: null, first_attempt_at: null, email_request_body: null,
      error_message: "Unknown result: timeout"
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await createNotificationWithDelivery(params);

    expect(result.email).toEqual({ status: "skipped", reason: "duplicate" });
    expect(store.deliveries[0].status).toEqual("failed");
    expect(store.deliveries[0].email_request_body).toBeNull();
    expect(log).toHaveBeenCalledWith("[notifications] email_duplicate: legacy-1");
    noResend(fetchMock);
  });
  it("N9 and N10 use distinct keys and entities for a charge", async () => {
    await createNotificationWithDelivery(params);
    await createNotificationWithDelivery({ ...params, emailKey: "payment-failed-pi_3NxAbC12" });
    await createNotificationWithDelivery({ ...params, type: "payment_recorded", entityType: "manager_payment",
      entityId: "manager-payment-1" });
    await createNotificationWithDelivery({ ...params, type: "payment_recorded", entityType: "rent_charge" });
    expect(store.deliveries.filter((row) => row.channel === "email")).toHaveLength(4);
    expect(store.notifications.size).toEqual(3);
  });
  it("N6 sends 30 and 60 day follow-ups once each on one charge", async () => {
    const followUp = { ...params, type: "delinquency_escalation" as const };
    await createNotificationWithDelivery({ ...followUp, emailKey: "overdue-30" });
    await createNotificationWithDelivery({ ...followUp, emailKey: "overdue-60" });
    await createNotificationWithDelivery({ ...followUp, emailKey: "overdue-60" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.deliveries.filter((row) => row.channel === "email").map((row) => row.email_key))
      .toEqual(["overdue-30", "overdue-60"]);
  });
  it("N6k validates keys before writes and keeps null separate from an explicit key", async () => {
    for (const emailKey of ["", "  ", "a b", "x.y", "-lead"]) {
      await expect(createNotificationWithDelivery({ ...params, emailKey })).rejects.toThrow("Invalid email key");
    }
    expect(store.from).not.toHaveBeenCalled();
    noResend(fetchMock);
    for (const emailKey of [undefined, "none", "overdue-60", "payment-failed-pi_3NxAbC12",
      "payment-failed-in_1AbCd"]) {
      await createNotificationWithDelivery({ ...params, emailKey });
    }
    expect(fetchMock.mock.calls.map(([, options]) => options.headers["Idempotency-Key"])).toEqual([
      "domus-n-notification-1", "domus-n-notification-1-k-none", "domus-n-notification-1-k-overdue-60",
      "domus-n-notification-1-k-payment-failed-pi_3NxAbC12",
      "domus-n-notification-1-k-payment-failed-in_1AbCd"
    ]);
  });
  it("N6r and N6s retry with identical bytes and leave pending rows alone", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Bad request" }) });
    await createNotificationWithDelivery(params);
    const body = store.deliveries[1].email_request_body;
    const first = store.deliveries[1].first_attempt_at;
    await createNotificationWithDelivery({ ...params, title: "Updated title" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(body);
    expect(store.deliveries[1].first_attempt_at).toBe(first);
    expect(store.deliveries[1].status).toBe("sent");
    expect([...store.notifications.values()][0].title).toBe("Updated title");
    store.deliveries[1].status = "pending";
    const duplicate = await createNotificationWithDelivery(params);
    expect(duplicate.email).toEqual({ status: "skipped", reason: "duplicate" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("N6p classifies Resend conflicts and prevents terminal retries", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({
      name: "concurrent_idempotent_requests"
    }) });
    await createNotificationWithDelivery(params);
    expect(store.deliveries[1].error_message).toEqual("Unknown result: concurrent request");
    await createNotificationWithDelivery(params);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({
      name: "invalid_idempotent_request"
    }) });
    await createNotificationWithDelivery({ ...params, emailKey: "invalid" });
    expect(store.deliveries[2].error_message).toEqual("Not sent: key reused with different content");
    await createNotificationWithDelivery({ ...params, emailKey: "invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("N6d stops uncertain retries after 20 hours from the first claim", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await createNotificationWithDelivery(params);
    expect(store.deliveries[1].error_message).toEqual("Unknown result: timeout");
    vi.setSystemTime(new Date("2026-10-21T07:00:00.000Z"));
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await createNotificationWithDelivery(params);
    expect(store.deliveries[1].first_attempt_at).toEqual("2026-10-20T12:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-21T09:00:00.000Z"));
    const expired = await createNotificationWithDelivery(params);
    expect(expired.email).toEqual({ status: "skipped", reason: "duplicate" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("N6p marks 500 uncertain and N6d retries definitive 4xx after 30 hours", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: "Server error" }) });
    await createNotificationWithDelivery(params);
    expect(store.deliveries[1].error_message).toEqual("Unknown result: Server error");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Bad request" }) });
    await createNotificationWithDelivery({ ...params, emailKey: "definitive" });
    vi.setSystemTime(new Date("2026-10-21T18:00:00.000Z"));
    await createNotificationWithDelivery({ ...params, emailKey: "definitive" });
    expect(store.deliveries[2].status).toEqual("sent");
  });

  it("N6g rechecks mode, allowlist, consent, pause, and recipient before retry", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Bad request" }) });
    await createNotificationWithDelivery(params);
    fetchMock.mockClear();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    expect((await createNotificationWithDelivery(params)).email).toEqual({ status: "skipped", reason: "off" });
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "someone@example.com");
    expect((await createNotificationWithDelivery(params)).email).toEqual({ status: "skipped", reason: "test_not_allowed" });
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    store.profiles.get("tenant-1")!.notification_preferences = { late_rent: false };
    expect((await createNotificationWithDelivery(params)).email).toEqual({ status: "skipped", reason: "preferences" });
    store.profiles.get("tenant-1")!.notification_preferences = {};
    store.profiles.get("tenant-1")!.notifications_paused_until = "9999-12-31T23:59:59Z";
    expect((await createNotificationWithDelivery(params)).email).toEqual({ status: "skipped", reason: "paused" });
    store.profiles.get("tenant-1")!.notifications_paused_until = null;
    store.profiles.get("tenant-1")!.email = "new@example.com";
    await createNotificationWithDelivery(params);
    noResend(fetchMock);
    expect(store.deliveries[1].error_message).toEqual("Not sent: recipient changed");
  });

  it("N6f fences stale workers and N14 handles missing columns", async () => {
    store.setMissingClaim(true);
    const missing = await createNotificationWithDelivery(params);
    expect(missing).toEqual({ inApp: { status: "sent" }, email: { status: "skipped", reason: "error" } });
    noResend(fetchMock);
    store.setMissingClaim(false);
    store.setMissingRecord(true);
    const sent = await createNotificationWithDelivery(params);
    expect(sent.email).toEqual({ status: "sent" });
    expect(store.deliveries[1].status).toEqual("pending");
    store.setMissingRecord(false);
    store.setLoseRecord(true);
    await createNotificationWithDelivery({ ...params, emailKey: "fenced" });
    expect(store.deliveries[2].status).toEqual("sent");
    expect(store.deliveries[2].claim_token).toEqual("other-worker");
    expect(store.deliveries.filter((row) => row.channel === "email")).toHaveLength(2);
  });

  it("N6x stores one recipient without cc or bcc and never logs the payload", async () => {
    await createNotificationWithDelivery(params);
    const stored = JSON.parse(store.deliveries[1].email_request_body as string);
    expect(stored.to).toEqual(["tenant@example.com"]);
    expect(stored).not.toHaveProperty("cc");
    expect(stored).not.toHaveProperty("bcc");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Please pay.");
  });
});
