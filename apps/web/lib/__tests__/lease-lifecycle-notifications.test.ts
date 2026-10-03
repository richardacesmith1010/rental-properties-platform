import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLeaseExpirationWarnings } from "@/lib/lease-lifecycle";

describe("lease lifecycle notification switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns before querying for expiration warnings when notifications are off", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;

    await expect(sendLeaseExpirationWarnings(supabase)).resolves.toContain("Notifications off");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
