import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { loginAction } from "@/app/actions/login";
import { resetFailureLimiterState } from "@/lib/rate-limit";

const BLOCKED_RESPONSE = {
  error: "Too many sign-in attempts. Wait 15 minutes or reset your password.",
  blocked: true
};
const INVALID_CREDENTIALS = {
  error: {
    code: "invalid_credentials",
    message: "Invalid login credentials"
  }
};
const OPERATIONAL_ERROR = {
  error: {
    code: "unexpected_failure",
    message: "Service temporarily unavailable",
    status: 500
  }
};

type SignInResult = { error: null | { code?: string; message: string; status?: number } };
type SignIn = (credentials: { email: string; password: string }) => Promise<SignInResult>;
type SignInMock = ReturnType<typeof vi.fn<SignIn>>;

function loginForm(email = "person@example.com", password = "CorrectHorse1") {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

function useSignInMock(signInWithPassword: SignInMock) {
  createClientMock.mockReturnValue({
    auth: { signInWithPassword }
  } as unknown as SupabaseClient);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectSuccessfulLogin(email = "person@example.com") {
  await expect(loginAction({}, loginForm(email))).rejects.toThrow("REDIRECT:/");
}

describe("loginAction failure limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    vi.clearAllMocks();
    resetFailureLimiterState();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  afterEach(() => {
    resetFailureLimiterState();
    vi.useRealTimers();
  });

  it("never blocks 10 successful sign-ins in a row", async () => {
    const signIn = vi.fn<SignIn>().mockResolvedValue({ error: null });
    useSignInMock(signIn);

    for (let index = 0; index < 10; index += 1) {
      await expectSuccessfulLogin();
    }

    expect(signIn).toHaveBeenCalledTimes(10);
  });

  it("blocks attempt 6 after 5 invalid-credential rejections without calling Supabase", async () => {
    const signIn = vi.fn<SignIn>().mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    for (let index = 0; index < 5; index += 1) {
      await loginAction({}, loginForm());
    }

    await expect(loginAction({}, loginForm("person@example.com", "CorrectHorse1"))).resolves.toEqual(
      BLOCKED_RESPONSE
    );
    expect(signIn).toHaveBeenCalledTimes(5);
  });

  it("clears 4 failures on success and requires 5 new failures before blocking", async () => {
    const signIn = vi
      .fn<SignIn>()
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    for (let index = 0; index < 4; index += 1) await loginAction({}, loginForm());
    await expectSuccessfulLogin();
    for (let index = 0; index < 5; index += 1) await loginAction({}, loginForm());

    await expect(loginAction({}, loginForm())).resolves.toEqual(BLOCKED_RESPONSE);
    expect(signIn).toHaveBeenCalledTimes(10);
  });

  it("normalizes email once for both the shared counter and Supabase", async () => {
    const signIn = vi.fn<SignIn>().mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    const variants = [
      " Person@Example.COM ",
      "person@example.com",
      "PERSON@EXAMPLE.COM",
      " person@example.com",
      "person@example.com "
    ];
    for (const email of variants) await loginAction({}, loginForm(email));

    await expect(loginAction({}, loginForm(" PERSON@example.com "))).resolves.toEqual(BLOCKED_RESPONSE);
    expect(signIn).toHaveBeenCalledTimes(5);
    for (const [credentials] of signIn.mock.calls) {
      expect(credentials.email).toBe("person@example.com");
    }
  });

  it("keeps the existing blocked response text and flag", async () => {
    const signIn = vi.fn<SignIn>().mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    for (let index = 0; index < 5; index += 1) await loginAction({}, loginForm());

    expect(await loginAction({}, loginForm())).toEqual(BLOCKED_RESPONSE);
  });

  it("counts only credential rejections around an operational error", async () => {
    const signIn = vi
      .fn<SignIn>()
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(INVALID_CREDENTIALS)
      .mockResolvedValueOnce(OPERATIONAL_ERROR)
      .mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    for (let index = 0; index < 6; index += 1) await loginAction({}, loginForm());

    await expect(loginAction({}, loginForm())).resolves.toEqual(BLOCKED_RESPONSE);
    expect(signIn).toHaveBeenCalledTimes(6);
  });

  it("never blocks 20 consecutive operational errors, including errors without a code", async () => {
    let invocation = 0;
    const signIn = vi
      .fn<SignIn>()
      .mockImplementation(async () =>
        invocation++ % 2 === 0
          ? OPERATIONAL_ERROR
          : { error: { message: "Network request failed" } }
      );
    useSignInMock(signIn);

    const results = [];
    for (let index = 0; index < 20; index += 1) {
      results.push(await loginAction({}, loginForm()));
    }

    expect(results.every((result) => result.blocked !== true)).toBe(true);
    expect(signIn).toHaveBeenCalledTimes(20);
  });

  it("does not classify unknown or absent error codes as credential failures", async () => {
    const signIn = vi
      .fn<SignIn>()
      .mockResolvedValueOnce({ error: { code: "unknown_code", message: "Invalid login credentials" } })
      .mockResolvedValueOnce({ error: { message: "Invalid login credentials" } })
      .mockResolvedValueOnce({ error: { code: "unknown_code", message: "Invalid login credentials" } })
      .mockResolvedValueOnce({ error: { message: "Invalid login credentials" } })
      .mockResolvedValueOnce({ error: { code: "unknown_code", message: "Invalid login credentials" } })
      .mockResolvedValue({ error: null });
    useSignInMock(signIn);

    for (let index = 0; index < 5; index += 1) await loginAction({}, loginForm());
    await expectSuccessfulLogin();

    expect(signIn).toHaveBeenCalledTimes(6);
  });

  it("allows at most 5 concurrent attempts to reach Supabase", async () => {
    const pending = deferred<SignInResult>();
    const signIn = vi.fn<SignIn>().mockReturnValue(pending.promise);
    useSignInMock(signIn);

    const attempts = Array.from({ length: 10 }, () => loginAction({}, loginForm()));

    expect(signIn).toHaveBeenCalledTimes(5);
    pending.resolve(INVALID_CREDENTIALS);
    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.blocked === true)).toHaveLength(5);
  });

  it("releases a reservation when signInWithPassword throws", async () => {
    const signIn = vi
      .fn<SignIn>()
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValue({ error: null });
    useSignInMock(signIn);

    await expect(loginAction({}, loginForm())).rejects.toThrow("network failure");
    await expectSuccessfulLogin();

    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("ignores stale credential rejections from an expired window", async () => {
    const oldAttempts = [deferred<SignInResult>(), deferred<SignInResult>(), deferred<SignInResult>()];
    const signIn = vi
      .fn<SignIn>()
      .mockReturnValueOnce(oldAttempts[0].promise)
      .mockReturnValueOnce(oldAttempts[1].promise)
      .mockReturnValueOnce(oldAttempts[2].promise)
      .mockResolvedValueOnce(OPERATIONAL_ERROR)
      .mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    const staleCalls = oldAttempts.map(() => loginAction({}, loginForm()));
    vi.advanceTimersByTime(900_001);
    await loginAction({}, loginForm());
    oldAttempts.forEach((attempt) => attempt.resolve(INVALID_CREDENTIALS));
    await Promise.all(staleCalls);

    for (let index = 0; index < 5; index += 1) await loginAction({}, loginForm());
    await expect(loginAction({}, loginForm())).resolves.toEqual(BLOCKED_RESPONSE);
    expect(signIn).toHaveBeenCalledTimes(9);
  });

  it("does not recreate a cleared window when stale attempts reject after success", async () => {
    const staleAttempts = [deferred<SignInResult>(), deferred<SignInResult>()];
    const signIn = vi
      .fn<SignIn>()
      .mockReturnValueOnce(staleAttempts[0].promise)
      .mockReturnValueOnce(staleAttempts[1].promise)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValue(INVALID_CREDENTIALS);
    useSignInMock(signIn);

    const staleCalls = staleAttempts.map(() => loginAction({}, loginForm()));
    await expectSuccessfulLogin();
    staleAttempts.forEach((attempt) => attempt.resolve(INVALID_CREDENTIALS));
    await Promise.all(staleCalls);

    for (let index = 0; index < 5; index += 1) await loginAction({}, loginForm());
    await expect(loginAction({}, loginForm())).resolves.toEqual(BLOCKED_RESPONSE);
    expect(signIn).toHaveBeenCalledTimes(8);
  });
});
