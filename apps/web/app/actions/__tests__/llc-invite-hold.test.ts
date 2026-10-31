import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), email: vi.fn(), client: vi.fn(), update: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: m.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/llc-invitation-email", () => ({ sendLLCInvitationEmail: m.email }));
vi.mock("@/lib/llc-invitations", async (original) => ({ ...await original<typeof import("@/lib/llc-invitations")>(),
  canUserManageLLCInvitations: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions", () => ({ acceptLLCInvitation: vi.fn(), createAccountToJoinLLC: vi.fn(), signInToJoinLLC: vi.fn(),
  signOut: vi.fn() }));
import { isLlcInvitesPaused } from "@/lib/llc-invitations";
import { sendLLCInvitations, resendLLCInvitation, cancelLLCInvitation, acceptLLCInvitation,
  signInToJoinLLC, createAccountToJoinLLC } from "../llc-invitations";
import { resolveInvitationForAcceptance } from "../llc-invitations-support";
import JoinLlcPage from "@/app/join-llc/page";
import { resetRateLimitState } from "@/lib/rate-limit";
const ownerCopy = "Partner invites are paused for a safety fix. Please try again in a few days.";
const inviteCopy = "This invite is paused for a safety fix. Please try again in a few days.";
const id = "11111111-1111-4111-8111-111111111111";
function form() {
  const f = new FormData(); for (const [k, v] of Object.entries({ token: id, email: "person@example.com", firstName: "First",
    lastName: "Last", password: "Password123", confirmPassword: "Password123", agree: "yes", termsVersion: "2026-10-30",
    privacyVersion: "2026-10-30" })) f.set(k, v); return f;
}
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState(); m.auth.mockResolvedValue({ user: { id: "owner" } });
});
describe("real LLC invitation hold", () => {
  it("LP1 real hold stops send and resend immediately after authentication", async () => {
    expect(isLlcInvitesPaused()).toBe(true);
    expect(await sendLLCInvitations(null, form())).toEqual({ success: false, error: ownerCopy });
    expect(await resendLLCInvitation(null, form())).toEqual({ success: false, error: ownerCopy });
    expect(m.auth).toHaveBeenCalledTimes(2); expect(m.admin).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
  });
  it("LP2 resolver and all acceptance paths stop before Auth, writes or delivery", async () => {
    expect(await resolveInvitationForAcceptance(id)).toEqual({ error: inviteCopy });
    expect(await acceptLLCInvitation(id)).toEqual({ success: false, error: inviteCopy });
    for (const invoke of [signInToJoinLLC, createAccountToJoinLLC]) {
      await expect(invoke(form())).rejects.toMatchObject({ digest: expect.stringContaining(encodeURIComponent(inviteCopy)) });
    }
    expect(m.client).not.toHaveBeenCalled();
    expect(m.admin).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled(); expect(m.auth).not.toHaveBeenCalled();
  });
  it("LP3 join page exposes only the hold sentence and no form", async () => {
    const markup = renderToStaticMarkup(await JoinLlcPage({ searchParams: Promise.resolve({ token: id }) }));
    expect(markup).toContain(inviteCopy); expect(markup).not.toContain("<form"); expect(m.admin).not.toHaveBeenCalled();
  });
  it("LP4 cancelling still updates an authorized pending invitation", async () => {
    m.update.mockReturnValue({ eq: async () => ({ error: null }) });
    m.admin.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      id, ownership_account_id: id, email: "person@example.com", status: "pending"
    }, error: null }) }) }), update: m.update }) });
    const f = new FormData(); f.set("invitationId", id);
    expect(await cancelLLCInvitation(null, f)).toEqual({ success: true, message: "Invitation cancelled for person@example.com." });
    expect(m.update.mock.calls).toEqual([[{ status: "cancelled" }]]); expect(m.email).not.toHaveBeenCalled();
  });
});
