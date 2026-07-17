import { describe, expect, it } from "vitest";
import { computeTrend } from "@/lib/dashboard";
import {
  getStatusCategory,
  getStatusClasses,
  statusAriaLabel,
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
      text: "text-[var(--pos)]",
      bg: "bg-[var(--pos-bg)]",
      border: "border-[color:color-mix(in_srgb,var(--pos)_28%,var(--pos-bg))]",
      dot: "bg-[var(--pos)]"
    });
  });

  it("returns warning and danger classes for the other categories", () => {
    expect(getStatusClasses("pending").text).toBe("text-[var(--warn)]");
    expect(getStatusClasses("overdue").text).toBe("text-[var(--crit)]");
    expect(getStatusClasses("draft").text).toBe("text-[var(--muted)]");
  });

  it("builds a combined badge class string", () => {
    const className = statusBadgeClasses("pending");

    expect(className).toContain("inline-flex");
    expect(className).toContain("tabular-nums");
    expect(className).toContain("text-[var(--warn)]");
    expect(className).toContain("border-[color:color-mix(in_srgb,var(--warn)_28%,var(--warn-bg))]");
  });

  it("builds an aria label for status badges", () => {
    expect(statusAriaLabel("in_progress")).toBe("Status: In Progress");
    expect(statusAriaLabel("paid", "Charge status")).toBe("Charge status: Paid");
    expect(statusAriaLabel("upcoming", "Lease status", "Expiring Soon")).toBe(
      "Lease status: Expiring Soon"
    );
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
