import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardNavigation } from "@/components/dashboard/dashboard-section-loaders";
import { ownerMenuGroups } from "@/components/dashboard/dashboard-config";
import type { DashboardProps } from "@/components/dashboard/types";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/owner",
  useSearchParams: () => new URLSearchParams()
}));

const kpis = {
  chargeBadgeCount: 0,
  hasActivitySection: false,
  hasAnalyticsSection: false,
  hasApplicationsSection: false,
  hasAutomationsSection: false,
  hasDocumentsSection: false,
  hasExpensesSection: false,
  hasInboxSection: false,
  hasInvitationsSection: false,
  hasLeasingSection: false,
  hasManagerPaymentsSection: false,
  hasMembersSection: false,
  hasNotificationsSection: false,
  hasOwnershipSection: false,
  hasVendorsSection: false,
  inboxBadgeCount: 0,
  isManagerRole: false,
  isOwnerRole: true,
  maintenanceBadgeCount: 0,
  notificationBadgeCount: 0
} as const;

function NavigationProbe({ initialSectionId }: { initialSectionId: string | null }) {
  const navigation = useDashboardNavigation(
    {
      data: { profileRole: "owner" },
      capabilities: {
        documentsEnabled: true,
        documentAssetAccessEnabled: true,
        notificationsEnabled: true,
        vendorWorkflowEnabled: true,
        photoWorkflowEnabled: true,
        ownershipEnabled: true,
        leasingPipelineEnabled: true,
        inboxThreadsEnabled: true,
        automationsEnabled: true,
        warnings: {},
        ownerSectionAvailability: {
          hasActivitySection: true,
          hasAnalyticsSection: true,
          hasApplicationsSection: true,
          hasAutomationsSection: true,
          hasDocumentsSection: true,
          hasExpensesSection: true,
          hasInboxSection: true,
          hasInvitationsSection: true,
          hasLeasingSection: true,
          hasManagerPaymentsSection: true,
          hasMembersSection: true,
          hasNotificationsSection: true,
          hasOwnershipSection: true,
          hasVendorsSection: true
        }
      },
      initialOwnerWorkflowMode: "daily_ops",
      initialSectionId,
      userEmail: "owner@example.com"
    } as DashboardProps,
    kpis as never
  );

  return (
    <>
      <div data-testid="navigation-state">
        {navigation.activeSection}|{navigation.activeSectionLabel}|{String(navigation.isUnknownSection)}
      </div>
      <div data-testid="section-ids">{navigation.sectionItems.map((item) => item.id).join(",")}</div>
      <div data-testid="section-count">{String(navigation.sectionItems.length)}</div>
      {navigation.sidebarItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => navigation.handleSidebarSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </>
  );
}

describe("useDashboardNavigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true
    });
  });

  it("keeps an unknown query section long enough for the fallback UI to render", () => {
    render(<NavigationProbe initialSectionId="foobar" />);

    expect(screen.getByTestId("navigation-state")).toHaveTextContent("foobar|Section not found|true");
  });

  it("keeps owner grouped navigation complete when deferred data is absent", () => {
    render(<NavigationProbe initialSectionId="overview" />);

    expect(screen.getByTestId("section-count")).toHaveTextContent(String(ownerMenuGroups.reduce((sum, group) => sum + group.items.length, 0) + 1));
    for (const group of ownerMenuGroups) for (const [, label] of group.items) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }

    const analyticsButton = screen.getByRole("button", { name: "Charts" });
    fireEvent.click(analyticsButton);

    expect(screen.getByTestId("navigation-state")).toHaveTextContent("analytics|Charts|false");
    expect(replaceMock).toHaveBeenCalledWith("/owner?section=analytics");
  });
});
