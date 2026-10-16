import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const rate = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { setManagerReminderPermission } from "@/app/actions/manager-permissions";

const accountId = "550e8400-e29b-41d4-a716-446655440001";
function form() {
  const data = new FormData();
  data.set("accountId", accountId);
  data.set("enabled", "true");
  data.set("p_actor_id", "forged");
  return data;
}

describe("manager reminder owner setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "owner-session" }, role: "owner" });
    rate.mockReturnValue({ allowed: true });
    rpc.mockResolvedValue({ data: "ok", error: null });
  });
  it("passes only the session actor and revalidates the settings", async () => {
    expect(await setManagerReminderPermission(null, form())).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("set_managers_can_send_reminders", {
      p_account_id: accountId, p_actor_id: "owner-session", p_value: true
    });
    expect(revalidate).toHaveBeenCalledWith("/settings");
  });
  it.each([
    ["not_allowed", "Only the owner can change this."],
    ["client_account", "We could not change this setting."],
    ["not_found", "We could not change this setting."]
  ])("maps %s to its approved message", async (code, message) => {
    rpc.mockResolvedValue({ data: code, error: null });
    expect(await setManagerReminderPermission(null, form())).toEqual({ success: false, error: message });
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("never reports a Supabase error as success", async () => {
    rpc.mockResolvedValue({ data: "ok", error: { code: "XX000" } });
    expect(await setManagerReminderPermission(null, form())).toEqual({
      success: false, error: "We could not change this setting."
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});
