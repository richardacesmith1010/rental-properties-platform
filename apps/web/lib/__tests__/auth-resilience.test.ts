import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), redirect: vi.fn(), getUser: vi.fn(), query: vi.fn(), maybeSingle: vi.fn(),
  storage: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getAuthenticatedUser, getAuthState, getCurrentUserRole, getUserProfileSummary } from "@/lib/auth";

const unavailable = "Account check is unavailable. Please try again.";
const timeout = { message: "Gateway Timeout", status: 504 };
const user = { id: "user-1", email: "tenant@example.com" };

function failureCause(error: unknown, original: unknown) {
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(unavailable);
  expect((error as Error).cause).toBe(original);
}

describe("auth resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
    mocks.query.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) });
    mocks.storage.mockReturnValue({ getPublicUrl: () => ({ data: { publicUrl: "avatar-url" } }) });
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.query,
      storage: { from: mocks.storage } });
  });

  it("uses one auth call on success", async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await getAuthenticatedUser()).toEqual(user);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("retries a resolved auth timeout once", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: timeout })
      .mockResolvedValueOnce({ data: { user }, error: null });
    expect(await getAuthenticatedUser()).toEqual(user);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("waits about 300 ms only after a transient failure", async () => {
    vi.useFakeTimers();
    try {
      mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: timeout })
        .mockResolvedValueOnce({ data: { user }, error: null });
      const pending = getAuthenticatedUser();
      await vi.advanceTimersByTimeAsync(299);
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual(user);
      expect(mocks.getUser).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws with the final resolved auth error as cause", async () => {
    const final = { message: "Gateway Timeout", status: 504 };
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: timeout })
      .mockResolvedValueOnce({ data: { user: null }, error: final });
    await getAuthenticatedUser().then(() => { throw new Error("unexpected success"); },
      (error) => failureCause(error, final));
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("retries a thrown network error and succeeds", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ data: { user }, error: null });
    expect(await getAuthenticatedUser()).toEqual(user);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("throws with the final thrown error as cause", async () => {
    const final = new Error("network unavailable");
    mocks.getUser.mockRejectedValueOnce(new Error("fetch failed")).mockRejectedValueOnce(final);
    await getAuthenticatedUser().then(() => { throw new Error("unexpected success"); },
      (error) => failureCause(error, final));
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it.each([{ data: { user: null }, error: null },
    { data: { user: null }, error: { name: "AuthSessionMissingError", status: 0 } },
    { data: { user: null }, error: { status: 401, message: "invalid JWT" } },
    { data: { user: null }, error: { status: 403, message: "user not found" } }])
  ("redirects an unauthenticated user without retry", async (result) => {
    mocks.getUser.mockResolvedValue(result);
    await expect(getAuthenticatedUser()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("throws a non-transient auth error without retry", async () => {
    const error = { status: 400, message: "bad request" };
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    await getAuthenticatedUser().then(() => { throw new Error("unexpected success"); },
      (caught) => failureCause(caught, error));
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a retry for a non-transient auth error", async () => {
    vi.useFakeTimers();
    try {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "bad request" } });
      await expect(getAuthenticatedUser()).rejects.toThrow(unavailable);
      expect(vi.getTimerCount()).toBe(0);
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a role timeout then keeps the owner role", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: timeout, status: 504 })
      .mockResolvedValueOnce({ data: { role: "owner" }, error: null });
    expect(await getCurrentUserRole(user.id)).toBe("owner");
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("throws after two role timeouts", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: timeout, status: 504 });
    await getCurrentUserRole(user.id).then(() => { throw new Error("unexpected tenant fallback"); },
      (error) => failureCause(error, timeout));
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it.each([{ code: "42501", message: "permission denied", status: 403 },
    { code: "PGRST116", message: "multiple rows returned", status: 406 },
    { status: 401, message: "unauthorized" }])
  ("throws a profile query error without retry", async (error) => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error, status: error.status });
    await getCurrentUserRole(user.id).then(() => { throw new Error("unexpected tenant fallback"); },
      (caught) => failureCause(caught, error));
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it.each([null, { role: "unrecognized" }])("keeps the tenant fallback for a successful query", async (data) => {
    mocks.maybeSingle.mockResolvedValue({ data, error: null });
    expect(await getCurrentUserRole(user.id)).toBe("tenant");
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("keeps the successful profile summary", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { full_name: "Tenant", onboarding_completed_at: "today" }, error: null });
    expect((await getUserProfileSummary(user.id)).onboardingCompletedAt).toBe("today");
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning an empty profile summary", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { status: 403, message: "denied" } });
    await expect(getUserProfileSummary(user.id)).rejects.toThrow(unavailable);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("throws instead of reporting no profile", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: timeout, status: 504 });
    await expect(getAuthState(user.id, { invitedAt: null })).rejects.toThrow(unavailable);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not fetch the user when invitedAt is supplied", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { role: "tenant", onboarding_completed_at: "today" }, error: null });
    expect(await getAuthState(user.id, { invitedAt: null })).toMatchObject({ hasProfile: true, onboardingComplete: true });
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("retries the getAuthState user fallback once after a timeout", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { role: "tenant", onboarding_completed_at: null }, error: null });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: timeout })
      .mockResolvedValueOnce({ data: { user: { ...user, invited_at: "today" } }, error: null });
    expect(await getAuthState(user.id)).toMatchObject({ hasProfile: true, needsPasswordSet: true });
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("throws when the getAuthState user fallback stays unavailable", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.getUser.mockRejectedValue(new Error("network unavailable"));
    await expect(getAuthState(user.id)).rejects.toThrow(unavailable);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("keeps the unauthenticated getAuthState fallback for a missing session", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
    expect(await getAuthState(user.id)).toMatchObject({ hasProfile: false, needsPasswordSet: false });
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});
