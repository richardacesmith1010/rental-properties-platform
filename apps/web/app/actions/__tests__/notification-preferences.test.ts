import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferences } from "@/app/actions/notification-preferences";
import { DEFAULT_NOTIFICATION_EMAIL_PREFERENCES } from "@/lib/notification-preferences";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));

describe("notification preference save boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "person-1" }, role: "tenant" });
    mocks.rate.mockReturnValue({ allowed: true });
  });

  it.each([
    ["tenant", "maintenance_updates"],
    ["owner", "rent_due_reminder"]
  ] as const)("R3 %s changes one visible switch and preserves every stored hidden switch", async (role, key) => {
    mocks.auth.mockResolvedValue({ user: { id: "person-1" }, role });
    const stored = { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES, manager_invoice: false,
      rent_due_reminder: false, late_rent: false, maintenance_updates: false };
    const writes: unknown[] = [];
    mocks.admin.mockReturnValue({ from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({ eq: () => ({ single: async () => ({
          data: { notification_preferences: stored }, error: null
        }) }) }),
        update: (value: unknown) => {
          writes.push(value);
          return { eq: async () => ({ error: null }) };
        }
      };
    } });
    const form = new FormData();
    form.set("preferenceKey", key);
    form.set("enabled", "true");
    expect(await updateNotificationPreferences(null, form)).toMatchObject({ success: true });
    expect(writes).toEqual([{ notification_preferences: { ...stored, [key]: true } }]);
  });
});
