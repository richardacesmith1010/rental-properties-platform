import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAllSectionItems, getOwnerNavItems, getManagerModeNavItems } from "@/components/dashboard/dashboard-config";
import { SidebarNav, MobileTopBar } from "@/components/dashboard/sidebar/sidebar-nav";
import { OwnerAddMenu } from "@/components/dashboard/owner-add-menu";
import { OwnerSectionCacheContext } from "@/components/dashboard/owner-section-cache";
import { useDashboardNavigation } from "@/components/dashboard/dashboard-section-loaders";
import { useDashboardWorkflowHandlers } from "@/components/dashboard/dashboard-workflow-handlers";

vi.mock("next/navigation", () => ({ usePathname: () => "/owner", useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/theme-provider", () => ({ useDomusTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/dashboard/sidebar/user-footer", () => ({ SidebarUserFooter: () => null, MobileUserFooter: () => null }));
vi.mock("@/components/dashboard/notification-bell-menu", () => ({ NotificationBellMenu: () => null }));
vi.mock("@/components/dashboard/invitations/invite-manager-form", () => ({ InviteManagerForm: () => <p>Existing manager invite form</p> }));

const availability = {
  chargeBadgeCount: 2, inboxBadgeCount: 3, maintenanceBadgeCount: 1, notificationBadgeCount: 4,
  hasActivitySection: true, hasAnalyticsSection: true, hasApplicationsSection: true,
  hasAutomationsSection: true, hasDocumentsSection: true, hasExpensesSection: true,
  hasInboxSection: true, hasInvitationsSection: true, hasLeasingSection: true,
  hasManagerPaymentsSection: true, hasMembersSection: true, hasNotificationsSection: true,
  hasOwnershipSection: true, hasVendorsSection: true
};
const labels = ["Home", "Rent", "Repairs", "Messages", "Homes", "Units", "Leases", "Tenants",
  "Find a tenant", "Applications", "Invites", "Payments", "Expenses", "Charts", "Reports", "Manager pay",
  "Documents", "Vendors", "Owners", "Members", "Automations", "Activity", "Alerts", "Settings", "Help"];
const navProps = { role: "owner", userEmail: "", onSignOut: vi.fn(), reportsHref: "/owner/reports", onSelectItem: vi.fn() };

afterEach(() => vi.useRealTimers());

describe("owner grouped navigation", () => {
  it.each([true, false])("renders exact groups and order for LLC=%s, preserving badges and reachability", llc => {
    const available = buildAllSectionItems({ ...availability, hasMembersSection: llc });
    const items = getOwnerNavItems(available);
    expect(new Set(items.map(item => item.id))).toEqual(new Set(available.filter(item => item.id !== "operations").map(item => item.id)));
    render(<SidebarNav {...navProps} items={items} activeItemId="charges" />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(Array.from(nav.querySelectorAll("p")).map(p => p.textContent)).toEqual(["Every day", "Your homes", "Money", "More"]);
    const actual = Array.from(nav.querySelectorAll("button,a")).map(el => el.querySelector("span.truncate")?.textContent ?? el.textContent);
    expect(actual).toEqual(llc ? labels : labels.filter(label => label !== "Members"));
    expect(within(nav).getByRole("button", { name: "Rent 2" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Messages 3" })).toBeVisible();
    expect(within(nav).getByRole("button", { name: "Alerts 4" })).toBeVisible();
  });

  it("hides unavailable sections", () => {
    const items = getOwnerNavItems(buildAllSectionItems({ ...availability, hasExpensesSection: false, hasInboxSection: false }));
    expect(items.some(item => item.id === "expenses" || item.id === "inbox")).toBe(false);
  });

  it("uses the same grouped items in the mobile drawer", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(<MobileTopBar {...navProps} items={getOwnerNavItems(buildAllSectionItems(availability))} />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(Array.from(nav.querySelectorAll("button,a")).map(el => el.querySelector("span.truncate")?.textContent ?? el.textContent)).toEqual(labels);
  });

  it("requests delayed hover and immediate focus preload, cancelling on leave", () => {
    const cache = { preloadSection: vi.fn(), cancelScheduledPreload: vi.fn() };
    render(<OwnerSectionCacheContext.Provider value={cache as never}>
      <SidebarNav {...navProps} items={getOwnerNavItems(buildAllSectionItems(availability))} />
    </OwnerSectionCacheContext.Provider>);
    const rent = screen.getByRole("button", { name: "Rent 2" });
    fireEvent.mouseEnter(rent);
    expect(cache.preloadSection).toHaveBeenLastCalledWith("charges", 150);
    fireEvent.mouseLeave(rent);
    expect(cache.cancelScheduledPreload).toHaveBeenCalledOnce();
    fireEvent.focus(rent);
    expect(cache.preloadSection).toHaveBeenLastCalledWith("charges");
    fireEvent.blur(rent);
    expect(cache.cancelScheduledPreload).toHaveBeenCalledTimes(2);
  });
});

describe("Add menu", () => {
  it("opens each existing flow and returns focus on Escape", () => {
    const onAddHome = vi.fn(), onAddTenant = vi.fn();
    render(<OwnerAddMenu onAddHome={onAddHome} onAddTenant={onAddTenant} onInviteManager={vi.fn()} properties={[]} />);
    const add = screen.getByRole("button", { name: "Add" });
    fireEvent.click(add);
    expect(screen.getByRole("menuitem", { name: "Add a home" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Add a tenant" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(add).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a home" }));
    expect(onAddHome).toHaveBeenCalledOnce();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a tenant" }));
    expect(onAddTenant).toHaveBeenCalledOnce();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a manager" }));
    expect(screen.getByText("Existing manager invite form")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(add).toHaveFocus();
  });
});

describe("post-create and manager regression", () => {
  it("sends owners to Homes and Invites, and stays put for managers", () => {
    const jump = vi.fn();
    const { result } = renderHook(() => useDashboardWorkflowHandlers({ isOwnerRole: true, isManagerRole: false, managerWorkflowMode: "daily_ops", goToSectionIfVisible: jump }));
    act(() => result.current.handlePropertyCreated());
    expect(jump).toHaveBeenLastCalledWith("portfolio");
    act(() => result.current.handleTenantInviteSuccess());
    expect(jump).toHaveBeenLastCalledWith("invitations");
    act(() => result.current.handleManagerInviteSuccess());
    expect(jump).toHaveBeenCalledTimes(2);
  });
  it("preserves manager mode items, paging, and tenant wizard", () => {
    window.scrollTo = vi.fn();
    const { result } = renderHook(() => useDashboardNavigation({ data: { profileRole: "manager" } } as never, { ...availability, isOwnerRole: false, isManagerRole: true } as never));
    expect(result.current.sidebarItems).toEqual(getManagerModeNavItems());
    expect(result.current.sidebarItems.map(item => [item.id, item.label])).toEqual([
      ["manager:daily_ops", "Daily Ops"], ["manager:new_property", "New Property"],
      ["manager:new_tenant", "New Tenant"], ["tenants", "Tenants"], ["manager:vendor_ops", "Vendor Ops"]
    ]);
    act(() => result.current.goToNextSection());
    expect(result.current.activeSection).toBe("charges");
    act(() => result.current.handleSidebarSelect("manager:new_tenant"));
    expect(result.current.isTenantInviteWizardOpen).toBe(true);
  });
});
