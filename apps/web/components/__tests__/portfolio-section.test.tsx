import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortfolioSection } from "@/components/dashboard/portfolio-section";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

describe("PortfolioSection", () => {
  const properties = [
    {
      id: "property-1",
      name: "Atlas House",
      addressLine1: "123 Forum Ave",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      managementFeeCents: 15000,
      unitCount: 3,
      ownerAccountId: "acct-1",
      ownerAccountName: "Atlas LLC",
      active: true
    },
    {
      id: "property-2",
      name: "Imperium Flats",
      addressLine1: "456 Solar Way",
      city: "Aurora",
      state: "CO",
      postalCode: "80012",
      managementFeeCents: 10000,
      unitCount: 1,
      ownerAccountId: "acct-2",
      ownerAccountName: "Imperium Holdings",
      active: true
    }
  ];

  it("renders the property list when properties exist", () => {
    render(<PortfolioSection properties={properties} />);

    expect(screen.getByText("Atlas House")).toBeInTheDocument();
    expect(screen.getByText("Imperium Flats")).toBeInTheDocument();
  });

  it("shows the empty state when no properties exist", () => {
    render(<PortfolioSection properties={[]} />);

    expect(screen.getByText("No properties yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first property to start managing your portfolio.")).toBeInTheDocument();
  });

  it("shows property name, address, and owner account details", () => {
    render(<PortfolioSection properties={[properties[0]]} />);

    expect(screen.getByText("123 Forum Ave")).toBeInTheDocument();
    expect(screen.getByText("Denver, CO 80202")).toBeInTheDocument();
    expect(screen.getByText("Atlas LLC")).toBeInTheDocument();
  });

  it("renders management controls when showControls is true", () => {
    render(<PortfolioSection properties={[properties[0]]} showControls onUpdateProperty={async () => null} onDeleteProperty={async () => null} />);

    expect(screen.getByRole("button", { name: "Edit Atlas House" })).toBeInTheDocument();
    const manageButton = screen.getByRole("button", { name: "Manage" });
    expect(manageButton).toBeInTheDocument();

    fireEvent.click(manageButton);

    expect(screen.getByRole("button", { name: "Save Property Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("hides management controls when showControls is false", () => {
    render(<PortfolioSection properties={[properties[0]]} />);

    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("handles a single property correctly", () => {
    render(<PortfolioSection properties={[properties[0]]} />);

    expect(screen.getAllByText(/units?/i)[0]).toBeInTheDocument();
    expect(screen.getByText("3 units")).toBeInTheDocument();
  });

  it("supports property drill-down by click and keyboard", () => {
    const onSelectProperty = vi.fn();
    render(<PortfolioSection properties={[properties[0]]} onSelectProperty={onSelectProperty} />);

    fireEvent.click(screen.getByText("Atlas House"));
    expect(onSelectProperty).toHaveBeenCalledWith("property-1");

    fireEvent.keyDown(screen.getByRole("button", { name: /Atlas House/i }), { key: "Enter" });
    expect(onSelectProperty).toHaveBeenCalledTimes(2);
  });
});
