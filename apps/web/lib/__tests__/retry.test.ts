import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/retry";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("withRetry", () => {
  it("succeeds on the first attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds on the second attempt", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { baseDelayMs: 100 });

    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxAttempts", async () => {
    vi.useFakeTimers();
    const fn = vi.fn<() => Promise<never>>().mockRejectedValue(new Error("still failing"));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 50 });
    const assertion = expect(promise).rejects.toThrow("still failing");

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryIf returns false", async () => {
    const fn = vi.fn<() => Promise<never>>().mockRejectedValue(new Error("bad request"));

    await expect(
      withRetry(fn, {
        retryIf: (error) => !String(error).includes("bad request")
      })
    ).rejects.toThrow("bad request");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies exponential backoff between attempts", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { baseDelayMs: 100, backoffMultiplier: 3 });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toBe("ok");

    const delays = setTimeoutSpy.mock.calls.map((call) => Number(call[1]));
    expect(delays).toEqual([100, 300]);
  });

  it("caps the backoff at maxDelayMs", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockRejectedValueOnce(new Error("three"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 200,
      maxDelayMs: 250,
      backoffMultiplier: 2
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBe("ok");

    const delays = setTimeoutSpy.mock.calls.map((call) => Number(call[1]));
    expect(delays).toEqual([200, 250, 250]);
  });

  it("uses default options when none are provided", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
