import { describe, expect, it } from "vitest";
import {
  pluralize,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime
} from "../format";

describe("formatCurrency", () => {
  it("formats whole dollar amounts without decimals", () => {
    expect(formatCurrency(150000)).toBe("$1,500");
  });

  it("formats amounts with cents using 2 decimals", () => {
    expect(formatCurrency(150050)).toBe("$1,500.50");
  });

  it("formats zero as $0", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats sub-dollar amounts with cents", () => {
    expect(formatCurrency(99)).toBe("$0.99");
  });

  it("formats exact dollar amounts without decimals", () => {
    expect(formatCurrency(100)).toBe("$1");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-150000)).toBe("-$1,500");
  });

  it("formats negative amounts with cents", () => {
    expect(formatCurrency(-150050)).toBe("-$1,500.50");
  });

  it("formats very large amounts with grouping", () => {
    expect(formatCurrency(12345678900)).toBe("$123,456,789");
  });
});

describe("formatDate", () => {
  it("formats ISO dates", () => {
    expect(formatDate("2026-03-13T19:00:00.000Z")).toBe("Mar 13, 2026");
  });

  it("returns invalid strings unchanged", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("returns an empty string for null input", () => {
    expect(formatDate(null)).toBe("");
  });
});

describe("formatDateTime", () => {
  it("formats ISO datetimes", () => {
    expect(formatDateTime("2026-03-13T18:45:00.000Z")).toContain("2026");
  });

  it("returns invalid datetime strings unchanged", () => {
    expect(formatDateTime("invalid-datetime")).toBe("invalid-datetime");
  });
});

describe("pluralize", () => {
  it("returns the singular form for one item", () => {
    expect(pluralize(1, "unit")).toBe("1 unit");
  });

  it("returns the plural form for multiple items", () => {
    expect(pluralize(3, "unit")).toBe("3 units");
  });

  it("supports custom plural forms", () => {
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });

  it("handles y-ending nouns with ies by default", () => {
    expect(pluralize(0, "property")).toBe("0 properties");
    expect(pluralize(2, "property")).toBe("2 properties");
  });
});

describe("formatRelativeTime", () => {
  const now = "2026-03-13T12:00:00.000Z";

  it("shows just now for times under one minute", () => {
    expect(formatRelativeTime("2026-03-13T11:59:30.000Z", now)).toBe("just now");
  });

  it("shows minutes ago for recent times", () => {
    expect(formatRelativeTime("2026-03-13T11:45:00.000Z", now)).toBe("15 minutes ago");
  });

  it("shows 2 hours ago for hourly differences", () => {
    expect(formatRelativeTime("2026-03-13T10:00:00.000Z", now)).toBe("2 hours ago");
  });

  it("shows 3 days ago for day differences", () => {
    expect(formatRelativeTime("2026-03-10T12:00:00.000Z", now)).toBe("3 days ago");
  });

  it("shows future minute values for upcoming times", () => {
    expect(formatRelativeTime("2026-03-13T12:05:00.000Z", now)).toBe("in 5 minutes");
  });

  it("falls back to formatted dates for older timestamps", () => {
    expect(formatRelativeTime("2026-03-01T12:00:00.000Z", now)).toBe("Mar 1, 2026");
  });

  it("returns invalid strings unchanged", () => {
    expect(formatRelativeTime("bad-date", now)).toBe("bad-date");
  });
});
