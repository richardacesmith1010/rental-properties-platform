import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantsSection } from "@/components/dashboard/tenants-section";

const properties = [
  {
    id: "property-1",
    name: "1st Home",
    addressLine1: "101 Forum Ave",
    city: "Denver",
    state: "CO",
    postalCode: "80202",
    managementFeeCents: 0,
    unitCount: 1,
    ownerAccountId: null,
    ownerAccountName: "Owner Account",
    active: true
  },
  {
    id: "property-2",
    name: "Mom's House",
    addressLine1: "202 Forum Ave",
    city: "Denver",
    state: "CO",
    postalCode: "80203",
    managementFeeCents: 0,
    unitCount: 1,
    ownerAccountId: null,
    ownerAccountName: "Owner Account",
    active: true
  }
];

const units = [
  {
    id: "unit-1",
    propertyId: "property-1",
    propertyName: "1st Home",
    unitNumber: "A",
    bedrooms: 2,
    bathrooms: 1,
    monthlyRentCents: 150000,
    squareFeet: 900,
    occupied: true,
    active: true
  },
  {
    id: "unit-2",
    propertyId: "property-2",
    propertyName: "Mom's House",
    unitNumber: "B",
    bedrooms: 3,
    bathrooms: 2,
    monthlyRentCents: 180000,
    squareFeet: 1200,
    occupied: true,
    active: true
  },
  {
    id: "unit-3",
    propertyId: "property-1",
    propertyName: "1st Home",
    unitNumber: "C",
    bedrooms: 1,
    bathrooms: 1,
    monthlyRentCents: 140000,
    squareFeet: 700,
    occupied: false,
    active: true
  }
];

const tenants = [
  {
    id: "tenant-1",
    email: "angel@example.com",
    fullName: "Angel Hernandez",
    phone: "555-1234",
    propertyIds: ["property-1", "property-2"]
  },
  {
    id: "tenant-1",
    email: "angel@example.com",
    fullName: "Angel Hernandez",
    phone: "555-1234",
    propertyIds: ["property-1"]
  },
  {
    id: "tenant-2",
    email: "richard@example.com",
    fullName: "Richard Ace",
    phone: null,
    propertyIds: ["property-1"]
  }
];

const leases = [
  {
    id: "lease-1",
    unitId: "unit-1",
    propertyId: "property-1",
    propertyName: "1st Home",
    tenantProfileId: "tenant-1",
    unitLabel: "1st Home • A",
    tenantName: "Angel Hernandez",
    tenantEmail: "angel@example.com",
    tenantPhone: "555-1234",
    monthlyRentCents: 150000,
    depositCents: 150000,
    dueDayOfMonth: 1,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    leaseStatus: "active" as const,
    gracePeriodDays: 5,
    lateFeeCents: 5000,
    notes: null,
    active: true
  },
  {
    id: "lease-2",
    unitId: "unit-2",
    propertyId: "property-2",
    propertyName: "Mom's House",
    tenantProfileId: "tenant-1",
    unitLabel: "Mom's House • B",
    tenantName: "Angel Hernandez",
    tenantEmail: "angel@example.com",
    tenantPhone: "555-1234",
    monthlyRentCents: 180000,
    depositCents: 180000,
    dueDayOfMonth: 1,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    leaseStatus: "expired" as const,
    gracePeriodDays: 5,
    lateFeeCents: 5000,
    notes: null,
    active: false
  },
  {
    id: "lease-3",
    unitId: "unit-3",
    propertyId: "property-1",
    propertyName: "1st Home",
    tenantProfileId: "tenant-2",
    unitLabel: "1st Home • C",
    tenantName: "Richard Ace",
    tenantEmail: "richard@example.com",
    tenantPhone: null,
    monthlyRentCents: 140000,
    depositCents: 140000,
    dueDayOfMonth: 1,
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    leaseStatus: "expired" as const,
    gracePeriodDays: 5,
    lateFeeCents: 5000,
    notes: null,
    active: false
  }
];

describe("TenantsSection", () => {
  it("renders the deduplicated tenant count in the header", () => {
    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
      />
    );

    expect(screen.getByText("Tenants (2)")).toBeInTheDocument();
  });

  it("shows one tenant row with every leased unit label across properties", () => {
    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
      />
    );

    expect(screen.getAllByText("Angel Hernandez")).toHaveLength(1);
    expect(screen.getByText("1st Home — Unit A")).toBeInTheDocument();
    expect(screen.getByText("Mom's House — Unit B")).toBeInTheDocument();
  });

  it("filters tenants by name with a case-insensitive search", () => {
    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
      />
    );

    fireEvent.change(screen.getByLabelText("Search by name or email"), {
      target: { value: "angel" }
    });

    expect(screen.getByText("Angel Hernandez")).toBeInTheDocument();
    expect(screen.queryByText("Richard Ace")).not.toBeInTheDocument();
  });

  it("filters tenants by email", () => {
    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
      />
    );

    fireEvent.change(screen.getByLabelText("Search by name or email"), {
      target: { value: "richard@example.com" }
    });

    expect(screen.getByText("Richard Ace")).toBeInTheDocument();
    expect(screen.queryByText("Angel Hernandez")).not.toBeInTheDocument();
  });

  it("renders the empty state when no tenants are administered", () => {
    render(
      <TenantsSection tenants={[]} leases={[]} properties={[]} units={[]} />
    );

    expect(screen.getByText("No tenants yet")).toBeInTheDocument();
    expect(
      screen.getByText("Invite a tenant from the Leases section.")
    ).toBeInTheDocument();
  });

  it("shows active and inactive lease badges based on active lease count", () => {
    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
      />
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("No active lease")).toBeInTheDocument();
  });

  it("calls onViewActivity with the tenant id and first property id", () => {
    const onViewActivity = vi.fn();

    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
        onViewActivity={onViewActivity}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "View Activity" })[0]);

    expect(onViewActivity).toHaveBeenCalledWith("tenant-1", "property-1");
  });

  it("calls onSendMessage with the tenant id", () => {
    const onSendMessage = vi.fn();

    render(
      <TenantsSection
        tenants={tenants}
        leases={leases}
        properties={properties}
        units={units}
        onSendMessage={onSendMessage}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Send Message" })[0]);

    expect(onSendMessage).toHaveBeenCalledWith("tenant-1");
  });
});
