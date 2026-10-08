import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientDetail } from "@/components/dashboard/clients/client-detail";
import { ClientsSection } from "@/components/dashboard/clients/clients-section";
import { Dashboard } from "@/components/dashboard";
import { SectionFrame } from "@/components/dashboard/section-renderer-support";
import type { DashboardProps } from "@/components/dashboard/types";
import type { SectionRendererProps } from "@/components/dashboard/section-map";
import type { ClientDetail as Detail } from "@/lib/client-overview";

const client = { id: "client-1", name: "Taylor Homes", accountType: "llc" as const,
  contactEmail: null, homeCount: 1, summary: "No tenants yet" };
const detail: Detail = { ...client, homes: [] };
const home = { id: "home-1", name: "Atlas House", address: "123 Forum Ave", status: "no_tenant" as const };
const availableProperties = [{ id: "property-1", name: "Atlas House", addressLine1: "123 Forum Ave", city: "Denver", state: "CO" }];

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboard/dashboard-data-loader", () => ({ useDashboardData: () => ({
  activeSection: "clients", activeSectionLabel: "Clients", activeSectionIndex: 0,
  activeWorkflowMeta: null, isOwnerRole: false, isManagerRole: true, isOwnerDailyOpsHomePage: false,
  ownerOnboarding: { shouldShow: false }, llcSetupPrompt: { shouldShow: false }, layoutProps: {},
  displayDashboardData: { kpis: {} }, filteredPortfolio: { properties: [] }, safePortfolio: { properties: [] },
  sectionItems: [{ id: "clients" }], sectionRendererProps: { data: { profileRole: "manager" }, clients: [client] },
  goToPreviousSection: vi.fn(), goToNextSection: vi.fn(), openPropertyWizard: vi.fn(), openTenantInviteWizard: vi.fn(),
  closePropertyWizard: vi.fn(), closeLeaseWizard: vi.fn(), closeTenantInviteWizard: vi.fn(), commandPaletteProps: {},
  isPropertyWizardOpen: false, isLeaseWizardOpen: false, isTenantInviteWizardOpen: false,
  occupancy: 0, financialOverviewData: null, homeActionItems: [], isUnknownSection: false,
  isSectionLoading: false, showOnboardingWizard: false
}) }));
vi.mock("@/components/dashboard/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));
vi.mock("@/components/dashboard/section-map", () => ({ SectionSkeleton: () => null }));
vi.mock("@/components/dashboard/section-renderer", () => ({ SectionRenderer: () => (
  <ClientsSection clients={[client]} onCreateClientAccount={vi.fn()} />
) }));

const detailProps = (homes = detail.homes) => ({ client: { ...detail, homes },
  onCreatePropertyWithSetup: vi.fn(), onCreateClientAccount: vi.fn() });

function renderFrame(activeSection: string, profileRole: "owner" | "manager") {
  render(<SectionFrame props={{ activeSection, data: { profileRole }, availableProperties,
    selectedPropertyId: null, onSelectProperty: vi.fn() } as unknown as SectionRendererProps} sectionName="Test">
    <div>Content</div>
  </SectionFrame>);
}

describe("client page shell", () => {
  it("shows one manager Add client action and opens its sheet", () => {
    render(<Dashboard {...{ userEmail: "manager@example.test", data: { profileRole: "manager" }, clients: [client] } as DashboardProps} />);
    expect(screen.getAllByRole("button", { name: "Add client" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add client" }));
    expect(screen.getByLabelText("Client name")).toBeInTheDocument();
  });

  it("hides All homes for manager clients but keeps it for owner charges", () => {
    renderFrame("clients", "manager");
    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
    renderFrame("charges", "owner");
    expect(screen.getByLabelText("Show")).toBeInTheDocument();
  });

  it("shows one Add a home button for an empty client and one with a home", () => {
    const { unmount } = render(<ClientDetail {...detailProps()} />);
    expect(screen.getAllByRole("button", { name: "Add a home" })).toHaveLength(1);
    unmount();
    render(<ClientDetail {...detailProps([home])} />);
    expect(screen.getAllByRole("button", { name: "Add a home" })).toHaveLength(1);
  });

  it("renders home and clients links without sign out", () => {
    render(<ClientDetail {...detailProps()} />);
    expect(screen.getByRole("link", { name: /Clients/ })).toHaveAttribute("href", "/manager?section=clients");
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/manager");
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});
