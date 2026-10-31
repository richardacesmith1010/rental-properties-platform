import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ createUser: vi.fn(), record: vi.fn(), finalize: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/llc-invitations", async (original) => ({ ...await original<typeof import("@/lib/llc-invitations")>(),
  getExistingProfileByEmail: async () => null,
  getLLCInvitationContextByToken: async () => ({ email: "invite@example.com", status: "pending", isExpired: false }) }));
vi.mock("@/app/actions/llc-invitations-support", async (original) => ({
  ...await original<typeof import("@/app/actions/llc-invitations-support")>(), finalizeInvitationAcceptance: m.finalize,
  revalidateLlcSurfaces: vi.fn()
}));
vi.mock("@/lib/legal-acceptance", async (original) => ({ ...await original<typeof import("@/lib/legal-acceptance")>(),
  recordLegalAcceptance: m.record, agreementClient: async () => "web" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: { createUser: m.createUser } } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: {
  signInWithPassword: m.signIn, getUser: async () => ({ data: { user: null }, error: null }) } }) }));
import JoinLlcPage from "@/app/join-llc/page";
import { createAccountToJoinLLC } from "../llc-invitations";
import { createLlcInvitationAccountSchema } from "@/lib/validations";
import { resetRateLimitState } from "@/lib/rate-limit";
const input = { token: "11111111-1111-4111-8111-111111111111", firstName: "First", lastName: "Last",
  password: "Password123", confirmPassword: "Password123", agree: "yes", termsVersion: "2026-10-30", privacyVersion: "2026-10-30" };
function form(overrides = {}) { const f = new FormData(); for (const [k, v] of Object.entries({ ...input, ...overrides })) f.set(k, v);
  return f; }
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState();
  m.createUser.mockResolvedValue({ data: { user: { id: "p", email: "invite@example.com" } }, error: null });
  m.record.mockResolvedValue({ ok: true }); m.finalize.mockResolvedValue({ success: true, accountId: "account" });
  m.signIn.mockResolvedValue({ error: null });
});
describe("LLC registration agreement form", () => {
  it("L1 schema rejects missing agreement and weak passwords with exact copy", () => {
    const unchecked = createLlcInvitationAccountSchema.safeParse({ ...input, agree: undefined });
    expect(unchecked.success).toBe(false);
    if (!unchecked.success) expect(unchecked.error.issues.map((issue) => issue.message)).toContain("Check the box to agree first.");
    const weak = createLlcInvitationAccountSchema.safeParse({ ...input, password: "abcdefgh", confirmPassword: "abcdefgh" });
    expect(weak.success).toBe(false);
    if (!weak.success) expect(weak.error.issues[0].message).toEqual("Use at least 8 characters with a capital letter and a number.");
  });
  it("L2 stale version redirects before Auth", async () => {
    await expect(createAccountToJoinLLC(form({ termsVersion: "old" }))).rejects.toMatchObject({
      digest: expect.stringContaining(encodeURIComponent("We just updated the Terms. Reload the page to read them."))
    }); expect(m.createUser).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
  });
  it("L3 records trusted invitation identity before acceptance and redirect", async () => {
    await expect(createAccountToJoinLLC(form())).rejects.toMatchObject({ digest: expect.stringContaining("/owner?account=account") });
    expect(m.record).toHaveBeenCalledTimes(1);
    expect(m.record.mock.calls[0][1]).toEqual({ profileId: "p", email: "invite@example.com", source: "llc_invite", client: "web" });
    expect(m.record.mock.invocationCallOrder[0]).toBeLessThan(m.finalize.mock.invocationCallOrder[0]);
  });
  it("L4 record failure signs in for agreement recovery", async () => {
    m.record.mockResolvedValue({ ok: false, code: "write_failed" });
    m.finalize.mockResolvedValue({ success: false, error: "Please agree to the Terms first.", code: "agreement_required" });
    const destination = `/agree?next=${encodeURIComponent(`/join-llc?token=${input.token}`)}`;
    await expect(createAccountToJoinLLC(form())).rejects.toMatchObject({ digest: expect.stringContaining(destination) });
    expect(m.finalize).toHaveBeenCalledTimes(1); expect(m.signIn).toHaveBeenCalledTimes(1);
  });
  it("L4b acceptance failure retains the saved record and redirects to the existing error", async () => {
    m.finalize.mockResolvedValue({ success: false, error: "This invitation is no longer active." });
    await expect(createAccountToJoinLLC(form())).rejects.toMatchObject({
      digest: expect.stringContaining(encodeURIComponent("This invitation is no longer active.")) });
    expect(m.record).toHaveBeenCalledTimes(1); expect(m.signIn).not.toHaveBeenCalled();
  });
  it("L5 real join form requires eight-character passwords, agreement and current versions", async () => {
    const html = renderToStaticMarkup(await JoinLlcPage({ searchParams: Promise.resolve({ token: input.token }) }));
    const container = document.createElement("div"); container.innerHTML = html;
    for (const id of ["join-llc-create-password", "join-llc-confirm-password"]) {
      expect(container.querySelector(`#${id}`)).toHaveAttribute("minLength", "8");
    }
    expect(container.querySelector('input[name="agree"]')).toHaveAttribute("required");
    expect(container.querySelector('input[name="termsVersion"]')).toHaveValue("2026-10-30");
    expect(container.querySelector('input[name="privacyVersion"]')).toHaveValue("2026-10-30");
  });
});
