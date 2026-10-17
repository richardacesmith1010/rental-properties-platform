import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const readSelectMock = vi.hoisted(() => vi.fn());
const readEqMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ update: updateMock, select: readSelectMock }) })
}));

import { getAskDomusConsent, setAskDomusConsent } from "@/app/actions/ai-consent";

describe("setAskDomusConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: "profile-a" }, role: "owner" });
    checkRateLimitMock.mockReturnValue({ allowed: true });
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ select: selectMock });
    selectMock.mockResolvedValue({ data: [{ id: "profile-a" }], error: null });
    readSelectMock.mockReturnValue({ eq: readEqMock });
    readEqMock.mockReturnValue({ single: singleMock });
    singleMock.mockResolvedValue({ data: { ai_consent_at: null }, error: null });
  });

  it("reads the signed-in user's consent without taking an ID", async () => {
    await expect(getAskDomusConsent()).resolves.toEqual({ enabled: false });
    expect(readSelectMock).toHaveBeenCalledWith("ai_consent_at");
    expect(readEqMock).toHaveBeenCalledWith("id", "profile-a");
    singleMock.mockResolvedValue({ data: { ai_consent_at: "2026-10-16T00:00:00Z" }, error: null });
    await expect(getAskDomusConsent()).resolves.toEqual({ enabled: true });
  });

  it("updates only the signed-in profile and consent column", async () => {
    const result = await setAskDomusConsent(true);
    expect(result).toEqual({ success: true });
    expect(requireAuthMock).toHaveBeenCalledWith("owner", "manager");
    expect(updateMock).toHaveBeenCalledWith({ ai_consent_at: expect.any(String) });
    expect(eqMock).toHaveBeenCalledWith("id", "profile-a");
    expect(selectMock).toHaveBeenCalledWith("id");
  });

  it("ignores extra fields and clears consent only for the signed-in profile", async () => {
    await setAskDomusConsent({ enabled: false, profile_id: "profile-b", role: "owner" } as never);
    expect(updateMock).not.toHaveBeenCalled();
    const result = await setAskDomusConsent(false);
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ ai_consent_at: null });
    expect(eqMock).toHaveBeenCalledWith("id", "profile-a");
  });

  it("fails when the update changes zero or multiple rows", async () => {
    selectMock.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "profile-a" }, { id: "profile-b" }], error: null });
    await expect(setAskDomusConsent(true)).resolves.toEqual({ success: false,
      error: "We could not save this. Please try again." });
    await expect(setAskDomusConsent(true)).resolves.toEqual({ success: false,
      error: "We could not save this. Please try again." });
  });

  it("reports a write error without exposing SQL", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "database detail" } });
    await expect(setAskDomusConsent(true)).resolves.toEqual({ success: false,
      error: "We could not save this. Please try again." });
  });

  it("rate limits repeated consent changes before writing", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false });
    await expect(setAskDomusConsent(true)).resolves.toEqual({ success: false,
      error: "We could not save this. Please try again." });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
