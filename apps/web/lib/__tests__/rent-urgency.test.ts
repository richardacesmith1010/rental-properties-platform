import { describe, expect, it } from "vitest";
import { getChargeUrgency } from "@/lib/rent-urgency";

const now = new Date("2026-03-18T12:00:00.000Z");

describe("getChargeUrgency", () => {
  it("returns none for charges due beyond the five-day warning window", () => {
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-03-28" }, now)).toEqual({
      level: "none",
      daysUntilDue: 10
    });
  });

  it("returns upcoming for charges due in three days", () => {
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-03-21" }, now)).toEqual({
      level: "upcoming",
      daysUntilDue: 3
    });
  });

  it("returns due_today for charges due today", () => {
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-03-18" }, now)).toEqual({
      level: "due_today",
      daysUntilDue: 0
    });
  });

  it("returns overdue for charges that are five days late", () => {
    expect(getChargeUrgency({ status: "late", dueDate: "2026-03-13" }, now)).toEqual({
      level: "overdue",
      daysUntilDue: -5
    });
  });

  it("returns none for paid charges regardless of due date", () => {
    expect(getChargeUrgency({ status: "paid", dueDate: "2026-03-13" }, now)).toEqual({
      level: "none",
      daysUntilDue: 0
    });
  });

  it("returns upcoming for charges due tomorrow", () => {
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-03-19" }, now)).toEqual({
      level: "upcoming",
      daysUntilDue: 1
    });
  });
});
