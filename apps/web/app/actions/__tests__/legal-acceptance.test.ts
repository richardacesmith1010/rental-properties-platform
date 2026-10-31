import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), upsert: vi.fn(), state: vi.fn(), redirect: vi.fn(), rethrow: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuthForExit: m.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => table === "profiles"
  ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "owner" }, error: null }) }) }) }
  : { upsert: m.upsert } }) }));
vi.mock("@/lib/auth", () => ({ getAuthState: m.state, getRoleHomePath: (role: string) => `/${role}` }));
vi.mock("@/lib/native-app-server", () => ({ isNativeAppServer: async () => false }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: m.rethrow }));
import { agreeToTerms, recordInviteAgreement } from "../legal-acceptance";
import { resetRateLimitState } from "@/lib/rate-limit";

function form(overrides: Record<string, string> = {}) {
  const f = new FormData(); for (const [k, v] of Object.entries({ agree: "yes", termsVersion: "2026-10-30",
    privacyVersion: "2026-10-30", next: "/owner/money", email: "forged@example.com", ...overrides })) f.set(k, v); return f;
}
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState(); vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "test-key");
  m.auth.mockResolvedValue({ user: { id: "p", email: "session@example.com" } });
  m.upsert.mockResolvedValue({ error: null });
  m.state.mockResolvedValue({ hasProfile: true, onboardingComplete: true, role: "owner", needsPasswordSet: false });
  m.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  m.rethrow.mockImplementation((error: Error) => { if (error.message.startsWith("REDIRECT:")) throw error; });
});
describe("agreement actions", () => {
  it.each([["A1", { agree: "" }, "Check the box to agree first."],
    ["A2", { termsVersion: "old" }, "We just updated the Terms. Reload the page to read them."]])(
    "%s rejects without writes", async (_id, overrides, error) => {
      expect(await agreeToTerms(null, form(overrides as Record<string, string>))).toEqual({ success: false, error });
      expect(m.upsert).not.toHaveBeenCalled();
    });
  it("A3,A7,A8 saves trusted session email then preserves redirect exceptions", async () => {
    await expect(agreeToTerms(null, form())).rejects.toThrow("REDIRECT:/owner/money");
    expect(m.upsert).toHaveBeenCalledTimes(1); const payload = m.upsert.mock.calls[0][0];
    expect(payload.source).toEqual("agree_page"); expect(payload).not.toHaveProperty("accepted_at");
    expect(payload.email_hmac).toEqual(createHmac("sha256", "test-key").update("session@example.com").digest("hex"));
    expect(m.upsert.mock.invocationCallOrder[0]).toBeLessThan(m.redirect.mock.invocationCallOrder[0]);
    expect(m.rethrow).toHaveBeenCalled();
  });
  it("A5 failed save returns copy without a redirect", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.upsert.mockResolvedValue({ error: { code: "failed" } });
    expect(await agreeToTerms(null, form())).toEqual({ success: false, error: "We could not save this. Please try again." });
    expect(m.redirect).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("A6 enforces per-user limit", async () => {
    for (let i = 0; i < 10; i++) await agreeToTerms(null, form({ agree: "" }));
    expect(await agreeToTerms(null, form())).toEqual({ success: false, error: "Too many tries. Please wait a minute." });
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("R1t invite rejects unchecked/stale, records the signed-in session and reports a save error", async () => {
    const input = { agreed: false, termsVersion: "2026-10-30", privacyVersion: "2026-10-30" };
    expect(await recordInviteAgreement(input)).toEqual({ success: false, error: "Check the box to agree first." });
    expect(await recordInviteAgreement({ ...input, agreed: true, termsVersion: "old" })).toEqual({ success: false,
      error: "We just updated the Terms. Reload the page to read them." });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(await recordInviteAgreement({ ...input, agreed: true })).toEqual({ success: true });
    expect(m.upsert.mock.calls[0][0].source).toEqual("invite");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.upsert.mockResolvedValue({ error: { code: "failed" } });
    expect(await recordInviteAgreement({ ...input, agreed: true })).toEqual({ success: false,
      error: "We could not save this. Please try again." }); log.mockRestore();
  });
});
