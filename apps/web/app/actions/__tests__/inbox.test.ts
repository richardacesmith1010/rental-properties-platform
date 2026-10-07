import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock
}));
vi.mock("@/lib/property-access", () => ({
  canUserAdministerProperty: canUserAdministerPropertyMock,
  getAdministeredPropertyIds: getAdministeredPropertyIdsMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createInboxThreadSchema: {},
  sendInboxMessageSchema: {},
  sendMessageToTenantSchema: {},
  requestManualPaymentConfirmationSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({
  ensureCapabilityEnabled: ensureCapabilityEnabledMock
}));

import { sendMessageToTenant, startTenantConversation } from "@/app/actions/inbox";
import { requestManualPaymentConfirmation } from "@/app/actions/inbox-manual-payment";

const homeA = "11111111-1111-4111-8111-111111111111";
const homeB = "22222222-2222-4222-8222-222222222222";

function tenantForm(body: string, propertyId?: string) {
  const form = new FormData();
  form.set("body", body);
  if (propertyId) form.set("propertyId", propertyId);
  return form;
}

function createTenantDb(options: {
  homes?: string[];
  messageError?: boolean;
  touchError?: boolean;
  conflict?: boolean;
} = {}) {
  const homes = options.homes ?? [homeA];
  const threads: Array<{ id: string; propertyId: string; subject: string }> = [];
  const messages: unknown[] = [];
  const writes: string[] = [];
  let conflictPending = options.conflict ?? false;
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    let operation = "select";
    let payload: Record<string, unknown> = {};
    const result = () => {
      if (table === "leases") return { data: homes.map((_, i) => ({ unit_id: `unit-${i}` })), error: null };
      if (table === "units") return { data: homes.map((id) => ({ property_id: id })), error: null };
      if (table === "properties") return { data: { owner_account_id: "account-1" }, error: null };
      if (table === "ownership_account_members") return { data: [{ profile_id: "owner-1" }, { profile_id: "owner-1" }], error: null };
      if (table === "property_managers") return { data: [{ manager_profile_id: "manager-1" }, { manager_profile_id: "former-1" }], error: null };
      if (table === "inbox_threads" && operation === "select") {
        const thread = threads.find((item) => item.propertyId === filters.property_id && item.subject === filters.subject);
        return { data: thread ? { id: thread.id } : null, error: null };
      }
      if (table === "inbox_threads" && operation === "insert") {
        writes.push("thread");
        if (conflictPending || threads.length > 0) {
          conflictPending = false;
          if (!threads.length) threads.push({ id: "thread-1", propertyId: payload.property_id as string, subject: payload.subject as string });
          return { data: null, error: { code: "23505" } };
        }
        threads.push({ id: "thread-1", propertyId: payload.property_id as string, subject: payload.subject as string });
        return { data: { id: "thread-1" }, error: null };
      }
      if (table === "inbox_threads" && operation === "update") {
        writes.push("touch");
        return { error: options.touchError ? { code: "ERROR", message: "private@example.com Secret body" } : null };
      }
      if (table === "inbox_messages") {
        writes.push("message");
        if (!options.messageError) messages.push(payload);
        return { error: options.messageError ? { code: "ERROR" } : null };
      }
      return { data: null, error: null };
    };
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters[column] = value; return query; },
      in: () => query,
      limit: () => query,
      maybeSingle: async () => result(),
      single: async () => result(),
      insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return query; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return query; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(resolve(result()))
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, threads, messages, writes, from };
}

function createInboxAdminClient(): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "units") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({
              data: [{ id: "unit-1", unit_number: "1A" }],
              error: null
            })
          )
        }))
      };
    }

    if (table === "leases") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "lease-1", unit_id: "unit-1" },
                    error: null
                  })
                }))
              }))
            }))
          }))
        }))
      };
    }

    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { name: "Atlas House", owner_account_id: "account-1" },
              error: null
            })
          }))
        }))
      };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                value === "tenant-1"
                  ? { full_name: "Taylor Tenant", email: "tenant@example.com" }
                  : { full_name: "Ace Owner", email: "owner@example.com" },
              error: null
            })
          }))
        }))
      };
    }

    if (table === "inbox_threads") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                  }))
                }))
              }))
            }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: "thread-1" }, error: null })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      };
    }

    if (table === "inbox_messages") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null })
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      }))
    };
  });

  return { from } as unknown as SupabaseClient;
}

describe("inbox actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
      role: "owner",
      supabase: {} as SupabaseClient
    });
  });

  it("sends the exact plain-language manual payment message and title", async () => {
    const inserted: Array<{ body?: string; subject?: string }> = [];
    const subjects: string[] = [];
    const rows: Record<string, Record<string, unknown> | Array<Record<string, unknown>>> = {
      rent_charges: { id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01", amount_cents: 100, status: "late" },
      leases: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
      units: { property_id: homeA, unit_number: "1A" },
      profiles: { full_name: "Taylor Tenant", email: "tenant@example.com" },
      properties: { name: "Atlas House", owner_account_id: "account-1" },
      ownership_account_members: [{ profile_id: "owner-1" }],
      inbox_threads: { id: "thread-1" }
    };
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        let listProfiles = false;
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            if (column === "subject") subjects.push(String(value));
            return query;
          },
          limit: () => query,
          in: () => { listProfiles = true; return query; },
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
          insert: (payload: { body?: string; subject?: string }) => {
            inserted.push(payload);
            return query;
          },
          update: () => query,
          single: async () => ({ data: rows[table] ?? null, error: null }),
          then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
            Promise.resolve(resolve({
              data: listProfiles && table === "profiles"
                ? [{ id: "owner-1", email: "owner@example.com", full_name: "Ace Owner" }]
                : rows[table] ?? null,
              error: null
            }))
        };
        return query;
      }
    });
    requireAuthMock.mockResolvedValue({ user: { id: "tenant-1", email: "tenant@example.com" } });
    parseFormDataMock.mockReturnValue({ success: true, data: { chargeId: "charge-1" } });
    const result = await requestManualPaymentConfirmation(null, new FormData());
    expect(result?.success).toBe(true);
    expect(subjects).toContain("Manual payment review - Atlas House • Unit 1A");
    expect(inserted.find((item) => item.body)?.body).toBe(
      "Taylor Tenant says they paid $1 for Atlas House • Unit 1A. " +
      "Rent due Oct 1, 2026. Please check, then mark it paid in Rent."
    );
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tenant says rent is paid" })
    );
  });

  it("rejects unauthorized senders for direct tenant messages", async () => {
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        recipientProfileId: "tenant-1",
        propertyId: "property-1",
        subject: "Rent reminder",
        body: "Rent is due tomorrow."
      }
    });
    canUserAdministerPropertyMock.mockResolvedValue(false);

    const result = await sendMessageToTenant(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "You do not have access to this tenant."
    });
  });

  it("creates an inbox thread and delivery notification for a valid direct tenant message", async () => {
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        recipientProfileId: "tenant-1",
        propertyId: "property-1",
        subject: "Rent reminder",
        body: "Rent is due tomorrow."
      }
    });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    createAdminClientMock.mockReturnValue(createInboxAdminClient());

    const result = await sendMessageToTenant(null, new FormData());

    expect(result).toEqual({ success: true, message: "Message sent." });
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: "tenant-1",
        type: "owner_message",
        entityType: "inbox_thread"
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tenant");
  });
});

describe("startTenantConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant" });
    checkRateLimitMock.mockReturnValue({ allowed: true });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    getAdministeredPropertyIdsMock.mockImplementation(async (id: string) =>
      id === "former-1" ? [] : [homeA]
    );
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
  });

  it("authenticates tenants before reading", async () => {
    requireAuthMock.mockRejectedValue(new Error("redirect"));
    await expect(startTenantConversation(null, tenantForm("Hello"))).rejects.toThrow("redirect");
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(requireAuthMock).toHaveBeenCalledWith("tenant");
  });

  it("rejects a non-tenant session before reading", async () => {
    requireAuthMock.mockRejectedValue(new Error("role redirect"));
    await expect(startTenantConversation(null, tenantForm("Hello"))).rejects.toThrow("role redirect");
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it.each(["", " ", "x".repeat(2001)])("rejects invalid message input", async (body) => {
    const result = await startTenantConversation(null, tenantForm(body));
    expect(result?.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before reads", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false });
    expect((await startTenantConversation(null, tenantForm("Hello")))?.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing leases and foreign properties without writes", async () => {
    const noLease = createTenantDb({ homes: [] });
    createAdminClientMock.mockReturnValue(noLease.client);
    expect(await startTenantConversation(null, tenantForm("Hello"))).toMatchObject({ success: false });
    expect(noLease.writes).toEqual([]);

    const crossTenant = createTenantDb();
    createAdminClientMock.mockReturnValue(crossTenant.client);
    expect(await startTenantConversation(null, tenantForm("Hello", homeB))).toMatchObject({ success: false });
    expect(crossTenant.writes).toEqual([]);
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
  });

  it("requires a home when several active properties exist", async () => {
    const db = createTenantDb({ homes: [homeA, homeB] });
    createAdminClientMock.mockReturnValue(db.client);
    expect(await startTenantConversation(null, tenantForm("Hello"))).toEqual({
      success: false, error: "Choose which home this is about."
    });
    expect(db.writes).toEqual([]);
  });

  it("uses a chosen active home for a multi-home tenant", async () => {
    const db = createTenantDb({ homes: [homeA, homeB] });
    createAdminClientMock.mockReturnValue(db.client);
    expect((await startTenantConversation(null, tenantForm("Hello", homeB)))?.success).toBe(true);
    expect(db.threads[0]?.propertyId).toBe(homeB);
  });

  it("uses the sole home, fixed subject, and current administrators", async () => {
    const db = createTenantDb();
    createAdminClientMock.mockReturnValue(db.client);
    expect(await startTenantConversation(null, tenantForm("  Hello  "))).toEqual({
      success: true, message: "Sent. Your landlord will see it in Messages."
    });
    expect(db.threads).toEqual([{ id: "thread-1", propertyId: homeA, subject: "Messages with your landlord" }]);
    expect(db.messages).toMatchObject([{ sender_profile_id: "tenant-1", body: "Hello" }]);
    expect(createNotificationWithDeliveryMock.mock.calls.map(([payload]) => payload.recipientProfileId).sort()).toEqual(["manager-1", "owner-1"]);
  });

  it("reuses a thread on a second call and after a unique conflict", async () => {
    const db = createTenantDb();
    createAdminClientMock.mockReturnValue(db.client);
    await startTenantConversation(null, tenantForm("First"));
    await startTenantConversation(null, tenantForm("Second"));
    expect(db.threads).toHaveLength(1);
    expect(db.messages).toHaveLength(2);

    const conflict = createTenantDb({ conflict: true });
    createAdminClientMock.mockReturnValue(conflict.client);
    expect((await startTenantConversation(null, tenantForm("Hello")))?.success).toBe(true);
    expect(conflict.threads).toHaveLength(1);
    expect(conflict.messages).toHaveLength(1);
  });

  it("handles concurrent starts with one thread and two messages", async () => {
    const db = createTenantDb();
    createAdminClientMock.mockReturnValue(db.client);
    const results = await Promise.all([
      startTenantConversation(null, tenantForm("First")),
      startTenantConversation(null, tenantForm("Second"))
    ]);
    expect(results.every((result) => result?.success)).toBe(true);
    expect(db.threads).toHaveLength(1);
    expect(db.messages).toHaveLength(2);
  });

  it("returns an error for message failure and success for touch failure", async () => {
    const failed = createTenantDb({ messageError: true });
    createAdminClientMock.mockReturnValue(failed.client);
    expect(await startTenantConversation(null, tenantForm("Hello"))).toEqual({
      success: false, error: "Your message didn't send. Please try again."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const touched = createTenantDb({ touchError: true });
    createAdminClientMock.mockReturnValue(touched.client);
    expect((await startTenantConversation(null, tenantForm("Secret body")))?.success).toBe(true);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Secret body");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private@example.com");
    errorSpy.mockRestore();
  });

  it("keeps sends successful when notification delivery fails", async () => {
    const db = createTenantDb();
    createAdminClientMock.mockReturnValue(db.client);
    createNotificationWithDeliveryMock.mockRejectedValue(new Error("private@example.com Secret body"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await startTenantConversation(null, tenantForm("Secret body")))?.success).toBe(true);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Secret body");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private@example.com");
    errorSpy.mockRestore();
  });
});
