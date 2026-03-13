import { describe, expect, it } from "vitest";
import {
  renewLeaseSchema,
  terminateLeaseSchema,
  updateLateFeeSchema
} from "../validations";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("renewLeaseSchema", () => {
  it("accepts a valid renewal request", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUuid,
      newStartDate: "2026-04-01",
      newEndDate: "2027-03-31",
      newMonthlyRentDollars: "1650",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing lease identifiers", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: "",
      newStartDate: "2026-04-01",
      newEndDate: "2027-03-31",
      newMonthlyRentDollars: "1650",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid date strings", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUuid,
      newStartDate: "2026-02-30",
      newEndDate: "2027-03-31",
      newMonthlyRentDollars: "1650",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUuid,
      newStartDate: "2026-04-01",
      newEndDate: "2026-03-01",
      newMonthlyRentDollars: "1650",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(false);
  });

  it("rejects a due day outside 1-28", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUuid,
      newStartDate: "2026-04-01",
      newEndDate: "2027-03-31",
      newMonthlyRentDollars: "1650",
      newDueDayOfMonth: "31"
    });

    expect(result.success).toBe(false);
  });
});

describe("terminateLeaseSchema", () => {
  it("accepts a valid termination request", () => {
    const result = terminateLeaseSchema.safeParse({
      leaseId: validUuid,
      terminationReason: "Resident requested an early move-out."
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing reason", () => {
    const result = terminateLeaseSchema.safeParse({
      leaseId: validUuid,
      terminationReason: ""
    });

    expect(result.success).toBe(false);
  });

  it("rejects reasons longer than 500 characters", () => {
    const result = terminateLeaseSchema.safeParse({
      leaseId: validUuid,
      terminationReason: "x".repeat(501)
    });

    expect(result.success).toBe(false);
  });
});

describe("updateLateFeeSchema", () => {
  it("accepts valid late fee settings", () => {
    const result = updateLateFeeSchema.safeParse({
      leaseId: validUuid,
      lateFeeDollars: "75",
      gracePeriodDays: "5"
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative late fees", () => {
    const result = updateLateFeeSchema.safeParse({
      leaseId: validUuid,
      lateFeeDollars: "-1",
      gracePeriodDays: "5"
    });

    expect(result.success).toBe(false);
  });

  it("rejects grace periods above 30 days", () => {
    const result = updateLateFeeSchema.safeParse({
      leaseId: validUuid,
      lateFeeDollars: "75",
      gracePeriodDays: "31"
    });

    expect(result.success).toBe(false);
  });
});
