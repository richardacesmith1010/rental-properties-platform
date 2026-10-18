import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), rate: vi.fn(), headers: vi.fn(), resend: vi.fn(), managerResend: vi.fn(), log: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/invite-resend", () => ({ resendInvitationEmail: mocks.resend }));
vi.mock("@/lib/manager-invite-rows", () => ({ resendManagerInvite: mocks.managerResend }));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => mocks.log }));

import { resendFromJoinLink } from "@/app/actions/join-invite";
import { INACTIVE_INVITE_MESSAGE } from "@/lib/join-invite";

const inviteId = "2e7bd787-5518-4fce-b9b0-4fa19c2ff324";
const row = {
  id: inviteId, email: "stored@example.com", full_name: "Real Person", role: "tenant", status: "pending",
  created_at: new Date().toISOString(), property_id: "stored-property", invited_by: "stored-inviter",
  ownership_account_id: null, invited_profile_id: null
};
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("inviteId", inviteId);
  Object.entries(extra).forEach(([key, value]) => data.set(key, value));
  return data;
}
function setup(rows: Array<typeof row | null> = [row, row]) {
  const single = vi.fn().mockImplementation(async () => ({ data: rows.shift() ?? null, error: null }));
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: single };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const updateChain = { eq: vi.fn(), then: vi.fn((resolve: (value: { error: unknown }) => void) =>
    Promise.resolve({ error: null }).then(resolve)) };
  updateChain.eq.mockReturnValue(updateChain);
  const updateEq = updateChain.eq;
  const update = vi.fn(() => updateChain);
  const from = vi.fn(() => ({ ...chain, update }));
  mocks.admin.mockReturnValue({ from });
  return { single, update, updateEq, updateChain, from, chain };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.headers.mockResolvedValue({ get: () => null });
  mocks.resend.mockResolvedValue({ ok: true, invitedProfileId: "generated" });
  mocks.managerResend.mockResolvedValue({ ok: true, invitedProfileId: "manager-profile" });
});

describe("public join resend", () => {
  it("uses only the stored row despite malicious fields", async () => {
    const calls = setup();
    const result = await resendFromJoinLink(null, form({
      email: "attacker@example.com", role: "owner", invited_by: "attacker",
      property_id: "other", redirectTo: "https://attacker.example"
    }));
    expect(result).toEqual({ success: true, message: "Sent. Check your email in a few minutes." });
    expect(mocks.resend).toHaveBeenCalledWith(row, "stored-inviter");
    expect(calls.chain.select).toHaveBeenCalledWith(expect.stringContaining("invited_by"));
    expect(calls.update).toHaveBeenCalledWith(expect.objectContaining({ invited_profile_id: "generated" }));
    expect(calls.updateEq).not.toHaveBeenCalledWith("status", "pending");
  });

  it("blocks the fourth request for one invite", async () => {
    setup([row, row, row, row, row, row]);
    let inviteChecks = 0;
    mocks.rate.mockImplementation((key: string) => ({ allowed: !key.startsWith("join-resend:invite:") || ++inviteChecks <= 3 }));
    for (let i = 0; i < 3; i++) await resendFromJoinLink(null, form());
    const sends = mocks.resend.mock.calls.length;
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: "Too many emails. Try again in an hour." });
    expect(mocks.resend).toHaveBeenCalledTimes(sends);
  });

  it("blocks by IP and skips an absent IP", async () => {
    setup();
    mocks.headers.mockResolvedValue({ get: (name: string) => name === "x-forwarded-for" ? "192.0.2.1, proxy" : null });
    mocks.rate.mockImplementation((key: string) => ({ allowed: !key.startsWith("join-resend:ip:") }));
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: "Too many emails. Try again in an hour." });
    expect(mocks.rate).toHaveBeenCalledWith("join-resend:ip:192.0.2.1", 10, 3600000);
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("fails closed when a limiter throws", async () => {
    setup();
    mocks.rate.mockImplementation(() => { throw new Error("unavailable"); });
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: "Could not send. Please try again." });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it.each(["revoked", "expired", "accepted"])("does not send a %s invite", async (status) => {
    setup([{ ...row, status }]);
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("does not send an owner invite", async () => {
    setup([{ ...row, role: "owner" }]);
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("catches a revoke between reads", async () => {
    setup([row, { ...row, status: "revoked" }]);
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(mocks.resend).not.toHaveBeenCalled();
  });

  it("returns failure when the core fails", async () => {
    setup();
    mocks.resend.mockResolvedValue({ ok: false });
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error: "Could not send. Please try again." });
  });

  it("returns success and logs a timestamp error after sending", async () => {
    const calls = setup();
    calls.updateChain.then.mockImplementation((resolve) =>
      Promise.resolve({ error: { message: "update failed" } }).then(resolve));
    expect(await resendFromJoinLink(null, form())).toEqual({ success: true, message: "Sent. Check your email in a few minutes." });
    expect(mocks.log).toHaveBeenCalled();
  });

  it("B19 routes manager rows to the restricted resend", async () => {
    const manager = { ...row, role: "manager" };
    const calls = setup([manager, manager]);
    expect(await resendFromJoinLink(null, form())).toEqual({
      success: true, message: "Sent. Check your email in a few minutes."
    });
    expect(mocks.managerResend).toHaveBeenCalledWith(manager, { inviterId: row.invited_by, grant: false });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(calls.updateEq).toHaveBeenCalledWith("status", "pending");
  });

  it.each([
    ["already_joined", "This invite was already used. Sign in instead."],
    ["not_pending", INACTIVE_INVITE_MESSAGE],
    ["login_gone", INACTIVE_INVITE_MESSAGE],
    ["no_access", INACTIVE_INVITE_MESSAGE],
    ["client_home", INACTIVE_INVITE_MESSAGE],
    ["lookup_failed", "Could not send. Please try again."],
    ["grant_failed", "Could not send. Please try again."],
    ["send_failed", "Could not send. Please try again."]
  ])("B19 maps manager %s to join copy", async (reason, error) => {
    const manager = { ...row, role: "manager" };
    setup([manager, manager]);
    mocks.managerResend.mockResolvedValue({ ok: false, reason });
    expect(await resendFromJoinLink(null, form())).toEqual({ success: false, error });
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
