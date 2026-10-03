import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  completeFailureAttempt,
  reserveFailureAttempt,
  resetFailureLimiterState,
  resetRateLimitState
} from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
    resetRateLimitState();
  });

  afterEach(() => {
    resetRateLimitState();
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    expect(checkRateLimit("charges:1", 2, 60_000)).toEqual({
      allowed: true,
      remaining: 1
    });
    expect(checkRateLimit("charges:1", 2, 60_000)).toEqual({
      allowed: true,
      remaining: 0
    });
  });

  it("blocks requests over the limit", () => {
    checkRateLimit("charges:1", 1, 60_000);
    expect(checkRateLimit("charges:1", 1, 60_000)).toEqual({
      allowed: false,
      remaining: 0
    });
  });

  it("resets the counter after the window expires", () => {
    checkRateLimit("charges:1", 1, 60_000);
    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit("charges:1", 1, 60_000)).toEqual({
      allowed: true,
      remaining: 0
    });
  });

  it("tracks independent keys separately", () => {
    checkRateLimit("charges:1", 1, 60_000);

    expect(checkRateLimit("charges:2", 1, 60_000)).toEqual({
      allowed: true,
      remaining: 0
    });
  });

  it("returns the remaining count accurately", () => {
    const first = checkRateLimit("leases:1", 5, 60_000);
    const second = checkRateLimit("leases:1", 5, 60_000);

    expect(first.remaining).toBe(4);
    expect(second.remaining).toBe(3);
  });

  it("allows requests exactly at the limit", () => {
    expect(checkRateLimit("edge:1", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("edge:1", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("edge:1", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("edge:1", 3, 60_000).allowed).toBe(false);
  });

  it("blocks immediately when maxRequests is zero", () => {
    expect(checkRateLimit("zero", 0, 60_000)).toEqual({
      allowed: false,
      remaining: 0
    });
  });

  it("does not let different keys interfere with each other", () => {
    for (let index = 0; index < 6; index += 1) {
      checkRateLimit("key-a", 5, 60_000);
    }

    expect(checkRateLimit("key-a", 5, 60_000)).toEqual({
      allowed: false,
      remaining: 0
    });
    expect(checkRateLimit("key-b", 5, 60_000)).toEqual({
      allowed: true,
      remaining: 4
    });
  });

  it("resets correctly for very short windows", () => {
    checkRateLimit("short-window", 1, 100);
    expect(checkRateLimit("short-window", 1, 100)).toEqual({
      allowed: false,
      remaining: 0
    });

    vi.advanceTimersByTime(101);

    expect(checkRateLimit("short-window", 1, 100)).toEqual({
      allowed: true,
      remaining: 0
    });
  });

  it("treats negative maxRequests as zero", () => {
    expect(checkRateLimit("negative", -1, 60_000)).toEqual({
      allowed: false,
      remaining: 0
    });
  });
});

describe("failure limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    resetFailureLimiterState();
  });

  afterEach(() => {
    resetFailureLimiterState();
    vi.useRealTimers();
  });

  it("allows reservations up to the boundary and blocks the next one", () => {
    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
    expect(reserveFailureAttempt("login:a", 2, 60_000)).toEqual({ allowed: false });
  });

  it("counts recorded failures and in-flight reservations together", () => {
    const first = reserveFailureAttempt("login:a", 3, 60_000);
    const second = reserveFailureAttempt("login:a", 3, 60_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    if (!first.allowed || !second.allowed) throw new Error("Expected reservations");

    completeFailureAttempt(first.reservation, "rejected");

    expect(reserveFailureAttempt("login:a", 3, 60_000).allowed).toBe(true);
    expect(reserveFailureAttempt("login:a", 3, 60_000)).toEqual({ allowed: false });
  });

  it("records rejected attempts as failures", () => {
    const result = reserveFailureAttempt("login:a", 1, 60_000);
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error("Expected reservation");

    completeFailureAttempt(result.reservation, "rejected");

    expect(reserveFailureAttempt("login:a", 1, 60_000)).toEqual({ allowed: false });
  });

  it("clears the window after a successful attempt", () => {
    const rejected = reserveFailureAttempt("login:a", 2, 60_000);
    expect(rejected.allowed).toBe(true);
    if (!rejected.allowed) throw new Error("Expected reservation");
    completeFailureAttempt(rejected.reservation, "rejected");

    const succeeded = reserveFailureAttempt("login:a", 2, 60_000);
    expect(succeeded.allowed).toBe(true);
    if (!succeeded.allowed) throw new Error("Expected reservation");
    completeFailureAttempt(succeeded.reservation, "succeeded");

    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
  });

  it("releases errored attempts without counting them", () => {
    const result = reserveFailureAttempt("login:a", 1, 60_000);
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error("Expected reservation");

    completeFailureAttempt(result.reservation, "errored");

    expect(reserveFailureAttempt("login:a", 1, 60_000).allowed).toBe(true);
  });

  it("starts a fresh window after expiry and ignores stale completions", () => {
    const oldResult = reserveFailureAttempt("login:a", 2, 60_000);
    expect(oldResult.allowed).toBe(true);
    if (!oldResult.allowed) throw new Error("Expected reservation");

    vi.advanceTimersByTime(60_001);
    const freshResult = reserveFailureAttempt("login:a", 2, 60_000);
    expect(freshResult.allowed).toBe(true);
    if (!freshResult.allowed) throw new Error("Expected reservation");

    completeFailureAttempt(oldResult.reservation, "rejected");
    completeFailureAttempt(freshResult.reservation, "rejected");

    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
  });

  it("never extends an unexpired window", () => {
    const first = reserveFailureAttempt("login:a", 2, 60_000);
    expect(first.allowed).toBe(true);
    if (!first.allowed) throw new Error("Expected reservation");
    completeFailureAttempt(first.reservation, "rejected");

    vi.advanceTimersByTime(59_999);
    const second = reserveFailureAttempt("login:a", 2, 60_000);
    expect(second.allowed).toBe(true);
    if (!second.allowed) throw new Error("Expected reservation");
    completeFailureAttempt(second.reservation, "rejected");
    expect(reserveFailureAttempt("login:a", 2, 60_000)).toEqual({ allowed: false });

    vi.advanceTimersByTime(2);
    expect(reserveFailureAttempt("login:a", 2, 60_000).allowed).toBe(true);
  });

  it("does not drop an expired entry with an in-flight reservation during cleanup", async () => {
    vi.resetModules();
    const limiter = await import("../rate-limit");
    const start = new Date("2026-10-03T12:00:00.000Z");
    const result = limiter.reserveFailureAttempt("login:a", 1, 599_999);
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error("Expected reservation");

    vi.advanceTimersByTime(600_000);
    limiter.completeFailureAttempt(result.reservation, "rejected");
    vi.setSystemTime(new Date(start.getTime() + 599_999));

    expect(limiter.reserveFailureAttempt("login:a", 1, 599_999)).toEqual({ allowed: false });
  });
});
