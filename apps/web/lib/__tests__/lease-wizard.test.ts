import { describe, expect, it } from "vitest";
import { getLeaseWizardStepError, type LeaseWizardDraft } from "@/components/dashboard/lease-wizard";
import { createDefaultLeaseWizardDraft } from "@/components/dashboard/lease-wizard-support";

function buildDraft(overrides: Partial<LeaseWizardDraft> = {}): LeaseWizardDraft {
  return {
    propertyId: "property-1",
    unitId: "unit-1",
    leaseType: "fixed_term",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    monthlyRentDollars: "1850",
    depositDollars: "900",
    dueDayOfMonth: "1",
    gracePeriodDays: "5",
    lateFeeDollars: "50",
    tenantMode: "existing",
    tenantProfileId: "tenant-1",
    tenantSearch: "",
    tenantFullName: "Alex Tenant",
    tenantEmail: "alex@example.com",
    ...overrides
  };
}

describe("lease wizard step validation", () => {
  it("requires a property on step 1", () => {
    expect(
      getLeaseWizardStepError({
        step: 0,
        draft: buildDraft({ propertyId: "" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("Select a property first.");
  });

  it("requires a vacant unit on step 1", () => {
    expect(
      getLeaseWizardStepError({
        step: 0,
        draft: buildDraft({ unitId: "" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("Select a vacant unit before continuing.");
  });

  it("requires end date after start date for fixed-term leases", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ endDate: "2026-03-31" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("End date must be after start date.");
  });

  it("requires positive monthly rent on step 2", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ monthlyRentDollars: "0" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("Monthly rent must be greater than $0.");
  });

  it("does not require an explicit end date for month-to-month leases", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ leaseType: "month_to_month", endDate: "" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBeNull();
  });

  it("requires an existing tenant when using the existing tenant mode", () => {
    expect(
      getLeaseWizardStepError({
        step: 2,
        draft: buildDraft({ tenantProfileId: "" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("Select an existing tenant or switch to invite a new tenant.");
  });

  it("requires an invite first when no tenants are available", () => {
    expect(
      getLeaseWizardStepError({
        step: 2,
        draft: buildDraft({ tenantProfileId: "" }),
        availableUnits: 1,
        availableTenants: 0
      })
    ).toBe("Invite a tenant to this property first.");
  });

  it("requires an email when inviting a new tenant", () => {
    expect(
      getLeaseWizardStepError({
        step: 2,
        draft: buildDraft({ tenantMode: "invite_new", tenantProfileId: "", tenantEmail: "" }),
        availableUnits: 1,
        availableTenants: 1
      })
    ).toBe("Enter the tenant's email address.");
  });

  it("does not auto-select the first property when multiple properties exist", () => {
    const draft = createDefaultLeaseWizardDraft({
      properties: [
        {
          id: "property-1",
          name: "Maple",
          addressLine1: "1 Maple",
          city: "Denver",
          state: "CO",
          postalCode: "80000",
          managementFeeCents: 0,
          unitCount: 1,
          ownerAccountId: null,
          ownerAccountName: "Owner",
          active: true
        },
        {
          id: "property-2",
          name: "Oak",
          addressLine1: "2 Oak",
          city: "Denver",
          state: "CO",
          postalCode: "80001",
          managementFeeCents: 0,
          unitCount: 1,
          ownerAccountId: null,
          ownerAccountName: "Owner",
          active: true
        }
      ],
      units: [],
      leases: [],
      tenants: []
    });

    expect(draft.propertyId).toBe("");
  });

  it("auto-selects the only property, unit, and tenant when each has one option", () => {
    const draft = createDefaultLeaseWizardDraft({
      properties: [
        {
          id: "property-1",
          name: "Maple",
          addressLine1: "1 Maple",
          city: "Denver",
          state: "CO",
          postalCode: "80000",
          managementFeeCents: 0,
          unitCount: 1,
          ownerAccountId: null,
          ownerAccountName: "Owner",
          active: true
        }
      ],
      units: [
        {
          id: "unit-1",
          propertyId: "property-1",
          propertyName: "Maple",
          unitNumber: "Unit 1",
          bedrooms: 2,
          bathrooms: 1,
          monthlyRentCents: 150000,
          squareFeet: null,
          occupied: false,
          active: true
        }
      ],
      leases: [],
      tenants: [
        {
          id: "tenant-1",
          email: "alex@example.com",
          fullName: "Alex Tenant",
          phone: null,
          propertyIds: ["property-1"]
        }
      ]
    });

    expect(draft.propertyId).toBe("property-1");
    expect(draft.unitId).toBe("unit-1");
    expect(draft.tenantProfileId).toBe("tenant-1");
  });
});
