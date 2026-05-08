import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardNavigation } from "@/components/dashboard/dashboard-section-loaders";
import type { DashboardProps } from "@/components/dashboard/types";

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
      initialOwnerWorkflowMode: "daily_ops",
      initialSectionId,
      userEmail: "owner@example.com"
    } as DashboardProps,
    kpis as never
  );

  return (
    <div data-testid="navigation-state">
      {navigation.activeSection}|{navigation.activeSectionLabel}|{String(navigation.isUnknownSection)}
    </div>
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
});
