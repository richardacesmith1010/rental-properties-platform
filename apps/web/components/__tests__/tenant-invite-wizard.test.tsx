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

import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { PropertyListItem } from "@/lib/portfolio";
import { TenantInviteStepOne, TenantInviteSuccess } from "@/components/dashboard/tenant-invite-wizard-support";

describe("tenant invite delivery", () => {
  const summary = { propertyName: "Home", unitLabel: "1", email: "tenant@example.com", fullName: "Alex" };
  it.each([
    ["email_branded", "They'll get an email from Domus with a link to join."],
    ["email_basic", "They'll get a sign-in email. Ask them to check spam if it doesn't come."],
    ["linked", "Alex already has a Domus account. We added them to this home. No email was sent."]
  ])("shows %s result", (delivery, text) => {
    render(<TenantInviteSuccess summary={summary} successMessage={delivery} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
  it("distinguishes no units and rented units and shows add only when available", () => {
    const props = {
      properties: [{ id: "home", name: "Home", unitCount: 0 }] as PropertyListItem[],
      availableUnits: [], draft: buildDraft({ propertyId: "home", unitId: "" }),
      onPropertyChange: vi.fn(), onUnitChange: vi.fn()
    };
    const { rerender } = render(<TenantInviteStepOne {...props} />);
    expect(screen.getByText("Add a unit to this home first.")).toBeInTheDocument();
    expect(screen.getByText("Ask the owner to add a unit.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a unit" })).not.toBeInTheDocument();
    rerender(<TenantInviteStepOne {...props} onAddUnit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add a unit" })).toBeInTheDocument();
    rerender(<TenantInviteStepOne {...props} properties={[{ id: "home", name: "Home", unitCount: 2 } as PropertyListItem]} />);
    expect(screen.getByText("Every unit has a tenant. Add a unit first.")).toBeInTheDocument();
  });
});
