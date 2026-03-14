import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitState } from "../rate-limit";

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
