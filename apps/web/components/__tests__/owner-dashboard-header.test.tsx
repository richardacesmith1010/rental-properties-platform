import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard";
import type { DashboardProps } from "@/components/dashboard/types";

const { previous, next, home, tenant } = vi.hoisted(() => ({ previous: vi.fn(), next: vi.fn(), home: vi.fn(), tenant: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboard/dashboard-data-loader", () => ({ useDashboardData: () => ({
  activeSection: "charges", activeSectionLabel: "Rent", activeSectionIndex: 1,
  activeWorkflowMeta: null, isOwnerRole: true, isManagerRole: false, isOwnerDailyOpsHomePage: false,
  ownerOnboarding: { shouldShow: false }, llcSetupPrompt: { shouldShow: false },
  layoutProps: {}, displayDashboardData: { kpis: {} }, filteredPortfolio: { properties: [] },
  safePortfolio: { properties: [] }, sectionItems: [{ id: "overview" }, { id: "charges" }],
  sectionRendererProps: { openSection: vi.fn(), filteredTickets: [] },
  goToPreviousSection: previous, goToNextSection: next, openPropertyWizard: home, openTenantInviteWizard: tenant,
  closePropertyWizard: vi.fn(), closeLeaseWizard: vi.fn(), closeTenantInviteWizard: vi.fn(),
  commandPaletteProps: {}, isPropertyWizardOpen: false, isLeaseWizardOpen: false, isTenantInviteWizardOpen: false
}) }));
vi.mock("@/components/dashboard/dashboard-layout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/dashboard/section-renderer", () => ({ SectionRenderer: () => <div>Full rent section</div> }));
vi.mock("@/components/dashboard/section-map", () => ({ SectionSkeleton: () => null }));

describe("owner header", () => {
  it("renders one Add button without modes, counters, or paging interactions", () => {
    const { container } = render(<Dashboard {...{
      userEmail: "", data: { profileRole: "owner" }, rentCollectionConnected: true
    } as DashboardProps} />);
    expect(screen.getByRole("heading", { name: "Rent" })).toBeVisible();
    expect(screen.getByText("Track rent and see who has paid.")).toBeVisible();
    expect(screen.getByText("Full rent section")).toBeVisible();
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
});
