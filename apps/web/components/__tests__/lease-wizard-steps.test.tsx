import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LeaseWizardStepOne,
  LeaseWizardStepThree
} from "@/components/dashboard/lease-wizard-steps";
import type { LeaseWizardDraft } from "@/components/dashboard/lease-wizard";

function buildDraft(overrides: Partial<LeaseWizardDraft> = {}): LeaseWizardDraft {
  return {
    propertyId: "",
    unitId: "",
    leaseType: "fixed_term",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    monthlyRentDollars: "1850",
    depositDollars: "900",
    dueDayOfMonth: "1",
    gracePeriodDays: "5",
    lateFeeDollars: "50",
    tenantMode: "existing",
    tenantProfileId: "",
    tenantSearch: "",
    tenantFullName: "",
    tenantEmail: "",
    ...overrides
  };
}

describe("lease wizard empty states", () => {
  it("shows a property empty state when no properties exist", () => {
    render(
      <LeaseWizardStepOne
        properties={[]}
        availableUnits={[]}
        draft={buildDraft()}
        onPropertyChange={vi.fn()}
        onUnitChange={vi.fn()}
        onCreatePropertyAction={vi.fn()}
        onAddUnitAction={vi.fn()}
      />
    );

    expect(screen.getByText("No properties found")).toBeInTheDocument();
    expect(
      screen.getByText("You need to create a property before you can set up a lease.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Property" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Property")).not.toBeInTheDocument();
  });

  it("shows a unit empty state when the selected property has no units", () => {
    render(
      <LeaseWizardStepOne
        properties={[
          {
            id: "property-1",
            name: "Maple House",
            addressLine1: "1 Maple St",
            city: "Denver",
            state: "CO",
            postalCode: "80000",
            managementFeeCents: 0,
            unitCount: 0,
            ownerAccountId: null,
            ownerAccountName: "Owner",
            active: true
          }
        ]}
        availableUnits={[]}
        draft={buildDraft({ propertyId: "property-1" })}
        onPropertyChange={vi.fn()}
        onUnitChange={vi.fn()}
        onCreatePropertyAction={vi.fn()}
        onAddUnitAction={vi.fn()}
      />
    );

    expect(screen.getByText("Maple House has no units")).toBeInTheDocument();
    expect(
      screen.getByText("Add a unit to this property before creating a lease.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a Unit" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Vacant unit")).not.toBeInTheDocument();
  });

  it("shows a tenant empty state when no tenants are available", () => {
    render(
      <LeaseWizardStepThree
        draft={buildDraft({ propertyId: "property-1", unitId: "unit-1" })}
        tenants={[]}
        onDraftChange={vi.fn()}
        onInviteTenantAction={vi.fn()}
      />
    );

    expect(screen.getByText("No tenants available")).toBeInTheDocument();
    expect(
      screen.getByText("Invite a tenant to this property first. They'll get an email to set up their account.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite Tenant" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tenant")).not.toBeInTheDocument();
  });
});
