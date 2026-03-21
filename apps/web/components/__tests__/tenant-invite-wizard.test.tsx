import { describe, expect, it } from "vitest";
import { getTenantInviteStepError, type TenantInviteWizardDraft } from "@/components/dashboard/tenant-invite-wizard";

function buildDraft(overrides: Partial<TenantInviteWizardDraft> = {}): TenantInviteWizardDraft {
  return {
    propertyId: "property-1",
    unitId: "unit-1",
    fullName: "Alex Tenant",
    email: "alex@example.com",
    phone: "",
    monthlyRentDollars: "",
    leaseStartDate: "",
    leaseEndDate: "",
    ...overrides
  };
}

describe("tenant invite wizard step validation", () => {
  it("requires a property on step 1", () => {
    expect(
      getTenantInviteStepError({
        step: 0,
        draft: buildDraft({ propertyId: "" }),
        availableUnits: 1
      })
    ).toBe("Select a property first.");
  });

  it("requires a unit on step 1", () => {
    expect(
      getTenantInviteStepError({
        step: 0,
        draft: buildDraft({ unitId: "" }),
        availableUnits: 2
      })
    ).toBe("Select a unit for this tenant.");
  });

  it("blocks step 1 when the property has no units", () => {
    expect(
      getTenantInviteStepError({
        step: 0,
        draft: buildDraft({ unitId: "" }),
        availableUnits: 0
      })
    ).toBe("Add a unit to this property before inviting a tenant.");
  });

  it("requires tenant name on step 2", () => {
    expect(
      getTenantInviteStepError({
        step: 1,
        draft: buildDraft({ fullName: "" }),
        availableUnits: 1
      })
    ).toBe("Enter the tenant's name.");
  });

  it("requires tenant email on step 2", () => {
    expect(
      getTenantInviteStepError({
        step: 1,
        draft: buildDraft({ email: "" }),
        availableUnits: 1
      })
    ).toBe("Enter the tenant's email address.");
  });
});
