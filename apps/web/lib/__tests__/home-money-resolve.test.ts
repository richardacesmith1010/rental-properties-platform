import { describe, expect, it } from "vitest";
import { resolveMoneySelection } from "@/app/owner/money/resolve";

const now = new Date("2026-10-03T15:00:00Z");
describe("money page selection", () => {
  it("falls back from a foreign property to the first administered home", () => {
    expect(resolveMoneySelection(["allowed", "second"], "foreign", undefined, now).propertyId).toBe("allowed");
  });
  it("uses real UTC today for the current month", () => {
    expect(resolveMoneySelection(["allowed"], undefined, "2026-10", now).alertToday).toBe("2026-10-03");
  });
  it("uses the last day for a past month", () => {
    expect(resolveMoneySelection(["allowed"], undefined, "2026-09", now).alertToday).toBe("2026-09-30");
  });
  it("uses today for the year tab", () => {
    expect(resolveMoneySelection(["allowed"], undefined, "year", now).alertToday).toBe("2026-10-03");
  });
});
