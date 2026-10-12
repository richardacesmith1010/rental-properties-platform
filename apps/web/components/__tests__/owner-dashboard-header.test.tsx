import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard";
import type { DashboardProps } from "@/components/dashboard/types";

const { previous, next, home, tenant, state } = vi.hoisted(() => ({
  previous: vi.fn(),
  next: vi.fn(),
  home: vi.fn(),
  tenant: vi.fn(),
  state: { section: "charges", role: "owner" },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboard/dashboard-data-loader", () => ({ useDashboardData: () => ({
  activeSection: state.section, activeSectionLabel: state.section === "overview" ? "Home" : "Rent", activeSectionIndex: 1,
  activeWorkflowMeta: null, isOwnerRole: state.role === "owner", isManagerRole: state.role === "manager",
  isOwnerDailyOpsHomePage: state.role === "owner" && state.section === "overview",
  ownerOnboarding: { shouldShow: false }, llcSetupPrompt: { shouldShow: false },
  layoutProps: {}, displayDashboardData: { kpis: {} }, filteredPortfolio: { properties: [] },
  safePortfolio: { properties: [] }, sectionItems: [{ id: "overview" }, { id: "charges" }],
  sectionRendererProps: { openSection: vi.fn(), filteredTickets: [] },
  goToPreviousSection: previous, goToNextSection: next, openPropertyWizard: home, openTenantInviteWizard: tenant,
  closePropertyWizard: vi.fn(), closeLeaseWizard: vi.fn(), closeTenantInviteWizard: vi.fn(),
  commandPaletteProps: {}, isPropertyWizardOpen: false, isLeaseWizardOpen: false, isTenantInviteWizardOpen: false
}) }));
vi.mock("@/components/dashboard/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/dashboard/section-renderer", () => ({ SectionRenderer: () => <div>Full rent section</div> }));
vi.mock("@/components/dashboard/section-map", () => ({ SectionSkeleton: () => null }));
vi.mock("@/components/dashboard/owner-daily-ops-home", () => ({ OwnerDailyOpsHome: () => <div>Wallet Home</div> }));

describe("owner header", () => {
  it("renders one Add button without modes, counters, or paging interactions", () => {
    const { container } = render(<Dashboard {...{
      userEmail: "", data: { profileRole: "owner" }, rentCollectionConnected: true
    } as DashboardProps} />);
    expect(screen.getByRole("heading", { name: "Rent" })).toBeVisible();
    expect(screen.getByText("Track rent and see who has paid.")).toBeVisible();
    expect(screen.getByText("Full rent section")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Rent" }).closest(".domus-card")).toBeNull();
    expect(screen.getByText("Full rent section").closest(".domus-card")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Add" })).toHaveLength(1);
    expect(screen.queryByText(/\d+ of \d+|workflow|daily operations mode/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous section" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next section" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.touchStart(container.querySelector("section")!, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(container.querySelector("section")!, { changedTouches: [{ clientX: 50 }] });
    expect(previous).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a home" }));
    expect(home).toHaveBeenCalledOnce();
  });

  it("never mounts the legacy bank banners for owners", () => {
    render(<Dashboard {...{
      userEmail: "owner@example.test",
      data: { profileRole: "owner" },
      stripeConnected: false,
      rentCollectionConnected: false,
      ownershipAccounts: [{ stripeStatus: "missing" }]
    } as DashboardProps} />);

    expect(screen.queryByText("Set up rent payments.")).not.toBeInTheDocument();
    expect(screen.queryByText("Your bank connection is missing")).not.toBeInTheDocument();
  });

  it("shows the large Home title and circular Add with announcements inside its menu", () => {
    state.section = "overview";
    try {
      render(<Dashboard {...{
        userEmail: "ace@example.test", nickname: "Ace", data: { profileRole: "owner" },
        onCreateAnnouncement: vi.fn(), onGetAnnouncementRecipientCount: vi.fn(),
        announcementProperties: [{ id: "p1", name: "Home" }],
        capabilities: { notificationsEnabled: true }
      } as unknown as DashboardProps} />);
      expect(screen.getByRole("heading", { name: "Home" })).toHaveClass("text-[34px]");
      expect(screen.getByRole("heading", { name: "Home" }).closest(".domus-card")).toBeNull();
      expect(screen.getByText("Wallet Home").closest(".domus-card")).toBeNull();
      expect(screen.getByRole("button", { name: "Add" })).toHaveClass("rounded-full");
      expect(screen.queryByRole("button", { name: "Send Announcement" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(screen.getByRole("menuitem", { name: "Send Announcement" })).toBeInTheDocument();
    } finally { state.section = "charges"; }
  });

  it("keeps manager Home and section header in the existing card", () => {
    state.role = "manager";
    try {
      for (const section of ["overview", "charges"]) {
        state.section = section;
        const view = render(<Dashboard {...{
          userEmail: "manager@example.test", data: { profileRole: "manager" }
        } as DashboardProps} />);
        const heading = screen.getAllByRole("heading")[0];
        expect(heading.closest(".domus-card")).not.toBeNull();
        view.unmount();
      }
    } finally { state.role = "owner"; state.section = "charges"; }
  });
});
