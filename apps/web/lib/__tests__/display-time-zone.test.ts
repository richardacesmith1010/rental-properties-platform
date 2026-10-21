import { describe, expect, it } from "vitest";
import { DISPLAY_TIME_ZONE, formatMonthName } from "@/lib/format";
import { STATEMENT_ZONE } from "@/lib/statement-month";

describe("shared display time zone", () => {
  it("B1 shares the Denver zone with statements", () => {
    expect(DISPLAY_TIME_ZONE).toEqual("America/Denver");
    expect(STATEMENT_ZONE).toBe(DISPLAY_TIME_ZONE);
  });

  it("B2 formats instant and calendar months separately", () => {
    expect(formatMonthName("2026-10-01T03:00:00Z")).toEqual("September");
    expect(formatMonthName("2026-10-01")).toEqual("October");
    expect(() => formatMonthName("bad")).not.toThrow();
  });
});
