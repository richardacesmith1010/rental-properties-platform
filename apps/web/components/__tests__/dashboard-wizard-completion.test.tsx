import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard";
import type { DashboardProps } from "@/components/dashboard/types";

const state = vi.hoisted(() => ({ role: "owner", section: "portfolio" }));
const selectProperty = vi.hoisted(() => vi.fn());
const closeWizard = vi.hoisted(() => vi.fn());
const openSection = vi.hoisted(() => vi.fn((section: string) => { state.section = section; }));
const filteredPortfolio = { properties: [{ id: "home-b" }], units: [], leases: [{ id: "lease-b", active: true }] };

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboard/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/dashboard/lease-wizard", () => ({ LeaseWizard: () => null }));
vi.mock("@/components/dashboard/tenant-invite-wizard", () => ({ TenantInviteWizard: () => null }));
vi.mock("@/components/dashboard/dashboard-data-loader", () => ({ useDashboardData: () => ({
  activeSection: state.section, activeSectionLabel: state.section === "overview" ? "Home" : "Homes",
  activeSectionIndex: 0, isOwnerRole: state.role === "owner", isManagerRole: state.role === "manager",
  isOwnerDailyOpsHomePage: state.role === "owner" && state.section === "overview",
  ownerOnboarding: { shouldShow: false }, llcSetupPrompt: { shouldShow: false }, layoutProps: {},
  displayDashboardData: { kpis: {}, profileRole: state.role }, financialOverviewData: null,
  filteredPortfolio, safePortfolio: { properties: [{ id: "home-a" }, { id: "home-b" }], units: [],
    leases: [{ id: "lease-a", active: true }, { id: "lease-b", active: true }] },
  sectionItems: [{ id: "overview" }, { id: "portfolio" }],
  sectionRendererProps: { openSection, onSelectProperty: selectProperty, data: { profileRole: state.role } },
  closePropertyWizard: closeWizard, closeLeaseWizard: vi.fn(), closeTenantInviteWizard: vi.fn(),
  commandPaletteProps: {}, isPropertyWizardOpen: true, isLeaseWizardOpen: false,
  isTenantInviteWizardOpen: false, isSectionLoading: false, showOnboardingWizard: false,
  isUnknownSection: false, homeActionItems: [], occupancy: 0
}) }));
vi.mock("@/components/dashboard/dashboard-layout", () => ({
  DashboardLayout: ({ children, afterMain }: { children: React.ReactNode; afterMain: React.ReactNode }) =>
    <main>{children}{afterMain}</main>
}));
vi.mock("@/components/dashboard/section-map", () => ({ SectionSkeleton: () => null }));
vi.mock("@/components/dashboard/section-renderer", () => ({
  SectionRenderer: ({ safePortfolio }: { safePortfolio: { leases: Array<{ id: string }> } }) =>
    <div data-testid="rent-leases">{safePortfolio.leases.map((lease) => lease.id).join(",")}</div>
}));
vi.mock("@/components/dashboard/owner-daily-ops-home", () => ({ OwnerDailyOpsHome: () => <div>Owner Home</div> }));
vi.mock("@/components/dashboard/property-wizard", () => ({
  PropertyWizard: ({ bankConnected, onComplete }: {
    bankConnected?: boolean; onComplete: (id: string) => void
  }) => <div>
    <span data-testid="bank-connected">{String(bankConnected)}</span>
    <button onClick={() => onComplete("home-b")}>Finish home</button>
  </div>
}));

function dashboard(stripeConnected = false) {
  return <Dashboard {...{ userEmail: "owner@example.test", data: { profileRole: state.role },
    stripeConnected } as DashboardProps} />;
}

afterEach(() => {
  state.role = "owner";
  state.section = "portfolio";
  selectProperty.mockClear();
  closeWizard.mockClear();
  openSection.mockClear();
});

describe("dashboard wizard completion", () => {
  it("opens owner Home without a property selection navigating back to Homes", () => {
    const view = render(dashboard());
    fireEvent.click(screen.getByRole("button", { name: "Finish home" }));
    expect(closeWizard).toHaveBeenCalledOnce();
    expect(selectProperty).not.toHaveBeenCalled();
    expect(openSection).toHaveBeenCalledWith("overview");
    view.rerender(dashboard());
    expect(screen.getByText("Owner Home")).toBeInTheDocument();
  });

  it("keeps manager selection and Home behavior", () => {
    state.role = "manager";
    render(dashboard());
    fireEvent.click(screen.getByRole("button", { name: "Finish home" }));
    expect(selectProperty).toHaveBeenCalledWith("home-b");
    expect(openSection).toHaveBeenCalledWith("overview");
  });

  it("passes the owner bank status to the wizard", () => {
    const view = render(dashboard(false));
    expect(screen.getByTestId("bank-connected")).toHaveTextContent("false");
    view.rerender(dashboard(true));
    expect(screen.getByTestId("bank-connected")).toHaveTextContent("true");
  });

  it("uses active leases from the current home on Rent", () => {
    state.section = "charges";
    render(dashboard());
    expect(screen.getByTestId("rent-leases")).toHaveTextContent("lease-b");
    expect(screen.getByTestId("rent-leases")).not.toHaveTextContent("lease-a");
  });
});
