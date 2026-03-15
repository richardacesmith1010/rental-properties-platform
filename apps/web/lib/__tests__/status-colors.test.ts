import { describe, expect, it } from "vitest";
import { computeTrend } from "@/lib/dashboard";
import {
  getStatusCategory,
  getStatusClasses,
  statusBadgeClasses
} from "@/lib/status-colors";

describe("status colors", () => {
  it("maps known statuses to the expected category", () => {
    expect(getStatusCategory("paid")).toBe("success");
    expect(getStatusCategory("pending")).toBe("warning");
    expect(getStatusCategory("overdue")).toBe("danger");
    expect(getStatusCategory("cancelled")).toBe("neutral");
  });

  it("returns neutral for unknown statuses", () => {
    expect(getStatusCategory("mystery_status")).toBe("neutral");
  });

  it("treats statuses as case-insensitive", () => {
    expect(getStatusCategory("PAID")).toBe("success");
    expect(getStatusCategory("In_Progress")).toBe("warning");
  });

  it("returns success classes for successful statuses", () => {
    expect(getStatusClasses("paid")).toEqual({
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      dot: "bg-emerald-500"
    });
  });

  it("returns warning and danger classes for the other categories", () => {
    expect(getStatusClasses("pending").text).toBe("text-amber-700");
    expect(getStatusClasses("overdue").text).toBe("text-red-700");
    expect(getStatusClasses("draft").text).toBe("text-gray-600");
  });

  it("builds a combined badge class string", () => {
    const className = statusBadgeClasses("pending");

    expect(className).toContain("inline-flex");
    expect(className).toContain("text-amber-700");
    expect(className).toContain("border-amber-200");
  });
});

describe("computeTrend", () => {
  it("returns up when the current value improves", () => {
    expect(computeTrend(200, 150)).toBe("up");
  });

  it("returns down when the current value declines", () => {
    expect(computeTrend(100, 150)).toBe("down");
  });

  it("returns flat when the values match", () => {
    expect(computeTrend(150, 150)).toBe("flat");
  });

  it("returns null when no previous value exists", () => {
    expect(computeTrend(150, null)).toBeNull();
  });
});
