import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays, daysBetween, denverDateOf, denverDayStartUtc, denverMonth, denverYear, todayDenver
} from "@/lib/denver-calendar";

const evening = new Date("2026-11-01T04:30:00Z");
const morning = new Date("2026-11-01T12:00:00Z");

describe("D1 Denver calendar", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the Denver date at the fall DST boundary", () => {
    expect(todayDenver(evening)).toEqual("2026-10-31");
    expect(todayDenver(morning)).toEqual("2026-11-01");
    expect(denverDateOf("2026-03-22T01:00:00Z")).toEqual("2026-03-21");
    expect(denverMonth(evening)).toEqual("2026-10");
    expect(denverYear(evening)).toEqual(2026);
  });

  it("does date-only arithmetic across month boundaries", () => {
    expect(addDays("2026-02-28", 1)).toEqual("2026-03-01");
    expect(daysBetween("2026-10-01", "2026-10-31")).toEqual(30);
  });

  it("finds Denver midnight on fall and spring clock changes", () => {
    expect(denverDayStartUtc("2026-11-01")).toEqual("2026-11-01T06:00:00.000Z");
    expect(denverDayStartUtc("2026-11-02")).toEqual("2026-11-02T07:00:00.000Z");
    expect(denverDayStartUtc("2026-03-08")).toEqual("2026-03-08T07:00:00.000Z");
    expect(denverDayStartUtc("2026-03-09")).toEqual("2026-03-09T06:00:00.000Z");
  });

  it("uses the frozen system clock for default today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(evening);
    expect(todayDenver()).toEqual("2026-10-31");
    vi.setSystemTime(morning);
    expect(todayDenver()).toEqual("2026-11-01");
  });
});
