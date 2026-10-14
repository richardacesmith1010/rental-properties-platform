import { describe, expect, it } from "vitest";
import { nextDueAfter, commonDue, COMMON_TASKS } from "@/lib/account-tasks";
import { createTaskSchema, updateTaskSchema } from "@/lib/validations";

describe("nextDueAfter", () => {
  it("advances a past monthly task beyond today", () => {
    expect(nextDueAfter("monthly", "2025-01-15", "2025-06-20")).toBe("2025-07-15");
  });
  it("clamps Jan 31 in ordinary and leap years", () => {
    expect(nextDueAfter("monthly", "2025-01-31", "2025-01-31")).toBe("2025-02-28");
    expect(nextDueAfter("monthly", "2024-01-31", "2024-01-31")).toBe("2024-02-29");
  });
  it("advances quarterly and yearly", () => {
    expect(nextDueAfter("quarterly", "2025-01-31", "2025-01-31")).toBe("2025-04-30");
    expect(nextDueAfter("yearly", "2024-02-29", "2024-02-29")).toBe("2025-02-28");
  });
  it("keeps as-needed undated", () => expect(nextDueAfter("as_needed", null, "2025-01-01")).toBeNull());
});
describe("task validation and starter dates", () => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const base = { accountId, title: "Pay vendors", frequency: "monthly", nextDueOn: "2026-10-13", ownerPartnerId: null };
  it("requires a trimmed title of 1 through 80 characters", () => {
    expect(createTaskSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, title: "x".repeat(81) }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, title: "x".repeat(80) }).success).toBe(true);
  });
  it("requires a due date except for as-needed tasks", () => {
    expect(createTaskSchema.safeParse({ ...base, nextDueOn: null }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, frequency: "as_needed", nextDueOn: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ ...base, taskId: accountId }).success).toBe(true);
  });
  it("has twelve editable starters with expected due dates", () => {
    expect(COMMON_TASKS).toHaveLength(12);
    expect(commonDue("monthly", "2026-10-13")).toBe("2026-11-01");
    expect(commonDue("yearly", "2026-10-13")).toBe("2027-01-31");
    expect(commonDue("as_needed", "2026-10-13")).toBeNull();
  });
});
