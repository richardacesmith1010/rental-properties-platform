import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortfolioSectionContent, SectionFrame, SectionNotFoundState } from "@/components/dashboard/section-renderer-support";
import { ExpensesSection } from "@/components/dashboard/expenses-section";
import type { SectionRendererProps } from "@/components/dashboard/section-map";

const availableProperties = [
  {
    id: "property-1",
    name: "Atlas House",
    addressLine1: "123 Forum Ave",
    city: "Denver",
    state: "CO"
  }
];

function buildProps(overrides: Partial<SectionRendererProps> = {}): SectionRendererProps {
  return {
    activeSection: "overview",
    data: {
      profileRole: "owner"
    },
    availableProperties,
    selectedPropertyId: null,
    onSelectProperty: vi.fn(),
    ...overrides
  } as SectionRendererProps;
}

function renderSectionFrame(overrides: Partial<SectionRendererProps> = {}) {
  const props = buildProps(overrides);
  render(
    <SectionFrame props={props} sectionName="Overview">
      <div>Section content</div>
    </SectionFrame>
  );
  return props;
}

describe("SectionFrame property scope control", () => {
  it("renders the selector for managers with available properties and scopes on selection", () => {
    const onSelectProperty = vi.fn();
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      onSelectProperty
    });

    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "property-1" }
    });

    expect(screen.getByRole("option", { name: "Atlas House" })).toBeInTheDocument();
    expect(onSelectProperty).toHaveBeenCalledWith("property-1");
  });

  it("hides the selector for managers with no available properties", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      availableProperties: []
    });

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
  });

  it("renders the selector for owners with available properties", () => {
    renderSectionFrame();

    expect(screen.getByLabelText("Show")).toBeInTheDocument();
  });

  it("hides the selector for tenants even when properties are available", () => {
    renderSectionFrame({
      data: { profileRole: "tenant" } as SectionRendererProps["data"]
    });

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
  });

  it("hides the selector on the members section", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      activeSection: "members"
    });

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
  });

  it("hides the selector on the tenants section", () => {
    renderSectionFrame({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      activeSection: "tenants"
    });

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
  });

  it("renders an explicit fallback for unknown sections", () => {
    render(<SectionNotFoundState activeSection="foobar" role="owner" />);

    expect(screen.getByText("Section not found")).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist for your role/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/owner");
  });

  it("shows the Rent help once for owners and managers", () => {
    const rentHelp = "Rent is added each month from your leases.";
    const { unmount } = render(
      <SectionFrame props={buildProps({ activeSection: "charges" })} sectionName="Rent">
        <div>Rent content</div>
      </SectionFrame>
    );
    expect(screen.queryByText(rentHelp)).not.toBeInTheDocument();
    unmount();

    render(
      <SectionFrame props={buildProps({ activeSection: "charges", data: { profileRole: "manager" } as SectionRendererProps["data"] })} sectionName="Rent">
        <div>Rent content</div>
      </SectionFrame>
    );
    expect(screen.queryByText(rentHelp)).not.toBeInTheDocument();
  });
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("full owner sections", () => {
  it("passes the manager role through to the homes view", () => {
    render(<PortfolioSectionContent props={buildProps({
      data: { profileRole: "manager" } as SectionRendererProps["data"],
      filteredPortfolio: { properties: [], units: [], leases: [], tenants: [] } as never,
      goToSectionIfVisible: vi.fn()
    })} />);
    expect(screen.getByText("Homes you manage")).toBeInTheDocument();
    expect(screen.getByText("No homes yet")).toBeInTheDocument();
  });

  it("shows every home without a shortened preview", () => {
    const properties = Array.from({ length: 7 }, (_, index) => ({
      ...availableProperties[0], id: `property-${index}`, name: `Home ${index}`,
      unitCount: 1, occupiedUnitCount: 1, monthlyRentCents: 10000
    }));
    render(<PortfolioSectionContent props={buildProps({
      filteredPortfolio: { properties, units: [], leases: [], tenants: [] } as never,
      goToSectionIfVisible: vi.fn()
    })} />);
    for (const property of properties) expect(screen.getByText(property.name)).toBeVisible();
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();
  });

  it("uses the plain money in and out heading in Expenses", () => {
    render(
      <ExpensesSection
        data={{ enabled: true, warning: null, properties: [], expenses: [], pnlByProperty: [], monthlyByProperty: {}, categoryByProperty: {} }}
        vendors={[]}
        propertyFiles={[]}
        onCreateExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
      />
    );
    expect(screen.getByText("Money in and out by home")).toBeInTheDocument();
    expect(screen.queryByText("Property P&L")).not.toBeInTheDocument();
  });
});

vi.mock("react-dom", async importOriginal => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: () => [null, vi.fn()], useFormStatus: () => ({ pending: false })
}));
