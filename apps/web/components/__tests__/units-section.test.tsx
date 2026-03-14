import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitsSection } from "@/components/dashboard/units-section";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

describe("UnitsSection", () => {
  const units = [
    {
      id: "unit-1",
      propertyId: "property-1",
      propertyName: "Atlas House",
      unitNumber: "1A",
      bedrooms: 2,
      bathrooms: 1.5,
      monthlyRentCents: 165000,
      occupied: true,
      active: true
    },
    {
      id: "unit-2",
      propertyId: "property-1",
      propertyName: "Atlas House",
      unitNumber: "2B",
      bedrooms: 1,
      bathrooms: 1,
      monthlyRentCents: 135000,
      occupied: false,
      active: true
    }
  ];

  it("renders the unit list when units exist", () => {
    render(<UnitsSection units={units} />);

    expect(screen.getByText("Atlas House • Unit 1A")).toBeInTheDocument();
    expect(screen.getByText("Atlas House • Unit 2B")).toBeInTheDocument();
  });

  it("shows the empty state when no units exist", () => {
    render(<UnitsSection units={[]} />);

    expect(screen.getByText("No units yet")).toBeInTheDocument();
    expect(screen.getByText("Add units to your properties to start creating leases.")).toBeInTheDocument();
  });

  it("shows unit number and property name", () => {
    render(<UnitsSection units={[units[0]]} />);

    expect(screen.getByText("Atlas House • Unit 1A")).toBeInTheDocument();
    expect(screen.getByText("2 bd / 1.5 ba")).toBeInTheDocument();
  });

  it("shows occupied badge when a unit is assigned", () => {
    render(<UnitsSection units={[units[0]]} />);

    expect(screen.getByText("Occupied")).toBeInTheDocument();
  });

  it("shows vacant badge when a unit has no occupant", () => {
    render(<UnitsSection units={[units[1]]} />);

    expect(screen.getByText("Vacant")).toBeInTheDocument();
  });

  it("renders edit and archive controls conditionally", () => {
    render(
      <UnitsSection
        units={[units[0]]}
        showControls
        onUpdateUnit={async () => null}
        onDeleteUnit={async () => null}
      />
    );

    const manageButton = screen.getByRole("button", { name: "Manage" });
    fireEvent.click(manageButton);

    expect(screen.getByRole("button", { name: "Save Unit Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });
});
