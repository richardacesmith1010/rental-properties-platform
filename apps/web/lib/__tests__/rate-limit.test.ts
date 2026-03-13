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
});
