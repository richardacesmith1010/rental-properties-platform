import { describe, expect, it } from "vitest";
import {
  createLeaseSchema,
  parseFormData,
  updateLeaseDetailsSchema,
  updateLeaseSchema
} from "@/lib/validations";

function fullLeaseFormData() {
  const formData = new FormData();
  formData.set("unitId", "11111111-1111-4111-8111-111111111111");
  formData.set("tenantProfileId", "22222222-2222-4222-8222-222222222222");
  formData.set("leaseId", "33333333-3333-4333-8333-333333333333");
  formData.set("startDate", "2026-11-01");
  formData.set("endDate", "2027-10-31");
  formData.set("dueDayOfMonth", "1");
  formData.set("monthlyRentDollars", "2350");
  formData.set("depositDollars", "2350");
  formData.set("gracePeriodDays", "5");
  formData.set("lateFeeDollars", "0");
  return formData;
}

describe("outside-Domus lease validation", () => {
  it("defaults an unchecked create checkbox to false", () => {
    const result = parseFormData(createLeaseSchema, fullLeaseFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collectsOutsideDomus).toBe(false);
    }
  });

  it("parses a checked create checkbox as true", () => {
    const formData = fullLeaseFormData();
    formData.set("collectsOutsideDomus", "on");
    const result = parseFormData(createLeaseSchema, formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collectsOutsideDomus).toBe(true);
    }
  });

  it.each([
    ["true", true],
    ["false", false]
  ])("normalizes full update value %s to %s", (raw, expected) => {
    const formData = fullLeaseFormData();
    formData.set("collectsOutsideDomus", raw);
    const result = parseFormData(updateLeaseSchema, formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collectsOutsideDomus).toBe(expected);
    }
  });

  it("keeps patch updates optional while accepting both setting directions", () => {
    const absent = updateLeaseDetailsSchema.parse({
      leaseId: "33333333-3333-4333-8333-333333333333",
      notes: "Keep this note"
    });
    const enabled = updateLeaseDetailsSchema.parse({
      leaseId: "33333333-3333-4333-8333-333333333333",
      collectsOutsideDomus: "true"
    });
    const disabled = updateLeaseDetailsSchema.parse({
      leaseId: "33333333-3333-4333-8333-333333333333",
      collectsOutsideDomus: "false"
    });

    expect(absent.collectsOutsideDomus).toBeUndefined();
    expect(enabled.collectsOutsideDomus).toBe(true);
    expect(disabled.collectsOutsideDomus).toBe(false);
  });
});
