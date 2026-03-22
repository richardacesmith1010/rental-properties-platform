import { describe, expect, it } from "vitest";
import { getLeaseWizardStepError, type LeaseWizardDraft } from "@/components/dashboard/lease-wizard";

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
        availableUnits: 1
      })
    ).toBe("Select a property first.");
  });

  it("requires a vacant unit on step 1", () => {
    expect(
      getLeaseWizardStepError({
        step: 0,
        draft: buildDraft({ unitId: "" }),
        availableUnits: 1
      })
    ).toBe("Select a vacant unit before continuing.");
  });

  it("requires end date after start date for fixed-term leases", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ endDate: "2026-03-31" }),
        availableUnits: 1
      })
    ).toBe("End date must be after start date.");
  });

  it("requires positive monthly rent on step 2", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ monthlyRentDollars: "0" }),
        availableUnits: 1
      })
    ).toBe("Monthly rent must be greater than $0.");
  });

  it("does not require an explicit end date for month-to-month leases", () => {
    expect(
      getLeaseWizardStepError({
        step: 1,
        draft: buildDraft({ leaseType: "month_to_month", endDate: "" }),
        availableUnits: 1
      })
    ).toBeNull();
  });

  it("requires an existing tenant when using the existing tenant mode", () => {
    expect(
      getLeaseWizardStepError({
        step: 2,
        draft: buildDraft({ tenantProfileId: "" }),
        availableUnits: 1
      })
    ).toBe("Select an existing tenant or switch to invite a new tenant.");
  });

  it("requires an email when inviting a new tenant", () => {
    expect(
      getLeaseWizardStepError({
        step: 2,
        draft: buildDraft({ tenantMode: "invite_new", tenantProfileId: "", tenantEmail: "" }),
        availableUnits: 1
      })
    ).toBe("Enter the tenant's email address.");
  });
});
