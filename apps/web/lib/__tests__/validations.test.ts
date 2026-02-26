import { describe, it, expect } from "vitest";
import {
  createPropertySchema,
  createUnitSchema,
  createLeaseSchema,
  payChargeSchema,
  parseFormData,
} from "../validations";

/* ─── createPropertySchema ─── */
describe("createPropertySchema", () => {
  it("accepts valid property data", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ZIP+4 format", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701-1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createPropertySchema.safeParse({
      name: "",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ZIP code", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "ABC",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── createUnitSchema ─── */
describe("createUnitSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid unit data", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: "2",
      bathrooms: "1.5",
      monthlyRentDollars: "1500",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(2);
      expect(result.data.bathrooms).toBe(1.5);
      expect(result.data.monthlyRentDollars).toBe(1500);
    }
  });

  it("coerces string numbers to numeric types", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "1A",
      bedrooms: "3",
      bathrooms: "2",
      monthlyRentDollars: "2000.50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.bedrooms).toBe("number");
      expect(typeof result.data.monthlyRentDollars).toBe("number");
    }
  });

  it("rejects non-UUID property ID", () => {
    const result = createUnitSchema.safeParse({
      propertyId: "not-a-uuid",
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative bedrooms", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: -1,
      bathrooms: 1,
      monthlyRentDollars: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero rent", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 0,
    });
    expect(result.success).toBe(false);
  });
});

/* ─── createLeaseSchema ─── */
describe("createLeaseSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";
  const validLease = {
    unitId: validUUID,
    tenantProfileId: validUUID,
    startDate: "2025-01-01",
    endDate: "2026-01-01",
    dueDayOfMonth: "1",
    monthlyRentDollars: "1500",
    depositDollars: "3000",
  };

  it("accepts valid lease data", () => {
    const result = createLeaseSchema.safeParse(validLease);
    expect(result.success).toBe(true);
  });

  it("rejects end date before start date", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      startDate: "2026-01-01",
      endDate: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects due day > 28", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      dueDayOfMonth: "31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects due day < 1", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      dueDayOfMonth: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative deposit", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      depositDollars: "-100",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── payChargeSchema ─── */
describe("payChargeSchema", () => {
  it("accepts a valid UUID", () => {
    const result = payChargeSchema.safeParse({
      chargeId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    const result = payChargeSchema.safeParse({
      chargeId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── parseFormData helper ─── */
describe("parseFormData", () => {
  function makeFormData(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      fd.append(key, value);
    }
    return fd;
  }

  it("parses valid form data against a schema", () => {
    const fd = makeFormData({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sunset Apartments");
      expect(result.data.postalCode).toBe("62701");
    }
  });

  it("trims whitespace from string values", () => {
    const fd = makeFormData({
      name: "  Sunset Apartments  ",
      addressLine1: " 123 Main St ",
      city: " Springfield ",
      state: " IL ",
      postalCode: " 62701 ",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sunset Apartments");
      expect(result.data.city).toBe("Springfield");
    }
  });

  it("returns first error message on invalid data", () => {
    const fd = makeFormData({
      name: "",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Property name is required.");
    }
  });

  it("returns error for completely empty form data", () => {
    const fd = makeFormData({});
    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings in unit schema", () => {
    const fd = makeFormData({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      unitNumber: "3C",
      bedrooms: "2",
      bathrooms: "1.5",
      monthlyRentDollars: "1200.00",
    });

    const result = parseFormData(createUnitSchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(2);
      expect(result.data.bathrooms).toBe(1.5);
      expect(result.data.monthlyRentDollars).toBe(1200);
    }
  });
});
