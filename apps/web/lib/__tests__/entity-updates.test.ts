import { describe, expect, it } from "vitest";
import {
  buildEntityUpdateFormData,
  buildLeaseEditFields,
  buildManagerEditFields,
  buildPropertyEditFields,
  buildTenantEditFields,
  buildUnitEditFields
} from "@/lib/entity-edit-fields";
import {
  buildChangedEntityValues,
  createEditableDraft,
  validateEditableField
} from "@/lib/entity-validation";

describe("entity edit field builders", () => {
  it("builds property edit fields with the expected keys", () => {
    const fields = buildPropertyEditFields({
      name: "Atlas House",
      addressLine1: "123 Forum Ave",
      city: "Denver",
      state: "CO",
      postalCode: "80202"
    });

    expect(fields.map((field) => field.key)).toEqual([
      "name",
      "addressLine1",
      "city",
      "state",
      "postalCode"
    ]);
  });

  it("builds unit edit fields with monthly rent and square footage support", () => {
    const fields = buildUnitEditFields({
      unitNumber: "Unit A",
      bedrooms: 2,
      bathrooms: 1.5,
      monthlyRentCents: 185000,
      squareFeet: 920
    });

    expect(fields.find((field) => field.key === "monthlyRentDollars")?.value).toBe(1850);
    expect(fields.find((field) => field.key === "squareFeet")?.value).toBe(920);
  });

  it("builds tenant and manager edit fields with owner-facing labels", () => {
    const tenantFields = buildTenantEditFields({
      fullName: "Taylor Tenant",
      email: "tenant@example.com",
      phone: null
    });
    const managerFields = buildManagerEditFields({
      managerName: "Morgan Manager",
      managerEmail: "manager@example.com",
      label: "Management Fee",
      paymentType: "percentage",
      percentageRate: 8.5,
      flatAmountCents: null,
      baseRentCents: 250000,
      frequency: "monthly"
    });

    expect(tenantFields.find((field) => field.key === "email")?.label).toBe("Display Email");
    expect(managerFields.find((field) => field.key === "paymentType")?.type).toBe("select");
  });

  it("builds a FormData payload with identity values plus updates", () => {
    const formData = buildEntityUpdateFormData(
      { leaseId: "lease-1" },
      { monthlyRentDollars: 2100, notes: "Updated terms" }
    );

    expect(formData.get("leaseId")).toBe("lease-1");
    expect(formData.get("monthlyRentDollars")).toBe("2100");
    expect(formData.get("notes")).toBe("Updated terms");
  });
});

describe("entity edit validation helpers", () => {
  it("only returns changed editable values", () => {
    const fields = buildLeaseEditFields({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monthlyRentCents: 180000,
      notes: "Original notes"
    });
    const draft = createEditableDraft(fields);
    draft.monthlyRentDollars = "1950";
    draft.notes = "Updated terms";

    expect(buildChangedEntityValues(fields, draft)).toEqual({
      monthlyRentDollars: 1950,
      notes: "Updated terms"
    });
  });

  it("validates required and typed field values", () => {
    const [nameField] = buildPropertyEditFields({
      name: "Atlas House",
      addressLine1: "123 Forum Ave",
      city: "Denver",
      state: "CO",
      postalCode: "80202"
    });
    const emailField = buildTenantEditFields({
      fullName: "Taylor Tenant",
      email: "tenant@example.com",
      phone: null
    }).find((field) => field.key === "email");

    expect(validateEditableField(nameField, "")).toBe("Property Name is required.");
    expect(validateEditableField(emailField!, "not-an-email")).toBe("Enter a valid display email.");
  });
});
