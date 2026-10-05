import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAllSectionItems, getOwnerNavItems, getManagerNavItems, managerMenuGroups } from "@/components/dashboard/dashboard-config";
import { SidebarNav } from "@/components/dashboard/sidebar/sidebar-nav";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
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
    expect(within(nav).getByRole("button", { name: "Rent 2 late" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Rent 2 late" })).toHaveClass("hover:bg-[var(--accent-weak)]");
    expect(within(nav).getByRole("button", { name: "Messages 3" })).toBeVisible();
    expect(within(nav).getByRole("button", { name: "Alerts 4" })).toBeVisible();
  });

  it("hides unavailable sections", () => {
    const items = getOwnerNavItems(buildAllSectionItems({ ...availability, hasExpensesSection: false, hasInboxSection: false }));
    expect(items.some(item => item.id === "expenses" || item.id === "inbox")).toBe(false);
  });

  it("uses the same grouped items in the mobile drawer", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(<DashboardLayout {...navProps} mainClassName="" items={getOwnerNavItems(buildAllSectionItems(availability))}><div>Page</div></DashboardLayout>);
    const shortcuts = screen.getByRole("navigation", { name: "Owner shortcuts" });
    expect(shortcuts).toHaveClass("lg:hidden");
    expect(within(shortcuts).getByText("2 late")).toBeInTheDocument();
    fireEvent.click(within(shortcuts).getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(Array.from(nav.querySelectorAll("button,a")).map(el => el.querySelector("span.truncate")?.textContent ?? el.textContent)).toEqual(labels);
  });

  it("requests delayed hover and immediate focus preload, cancelling on leave", () => {
    const cache = { preloadSection: vi.fn(), cancelScheduledPreload: vi.fn() };
    render(<OwnerSectionCacheContext.Provider value={cache as never}>
      <SidebarNav {...navProps} items={getOwnerNavItems(buildAllSectionItems(availability))} />
    </OwnerSectionCacheContext.Provider>);
    const rent = screen.getByRole("button", { name: "Rent 2 late" });
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
  it("shows only home and tenant actions for managers", () => {
    render(<OwnerAddMenu role="manager" onAddHome={vi.fn()} onAddTenant={vi.fn()} properties={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.queryByRole("menuitem", { name: "Add a manager" })).not.toBeInTheDocument();
  });

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

describe("manager grouped navigation", () => {
  it("keeps every requested section in its group when available", () => {
    const items = getManagerNavItems(buildAllSectionItems(availability));
    expect(Array.from(new Set(items.map(item => item.group)))).toEqual(managerMenuGroups.map(group => group.label));
    expect(items.map(item => item.label)).toEqual([
      "Home", "Rent", "Repairs", "Messages", "Homes", "Units", "Leases", "Tenants",
      "Find a tenant", "Applications", "Invites", "Payments", "Expenses", "Charts",
      "Documents", "Vendors", "Automations", "Activity", "Alerts"
    ]);
  });
});

describe("post-create and manager regression", () => {
  it("sends owners to Homes and Invites, and stays put for managers", () => {
    const jump = vi.fn();
    const { result } = renderHook(() => useDashboardWorkflowHandlers({ isOwnerRole: true, isManagerRole: false, goToSectionIfVisible: jump }));
    act(() => result.current.handlePropertyCreated());
    expect(jump).toHaveBeenLastCalledWith("portfolio");
    act(() => result.current.handleTenantInviteSuccess());
    expect(jump).toHaveBeenLastCalledWith("invitations");
    act(() => result.current.handleManagerInviteSuccess());
    expect(jump).toHaveBeenCalledTimes(2);
  });
  it("renders the manager grouped menu and opens the tenant wizard", () => {
    window.scrollTo = vi.fn();
    const { result } = renderHook(() => useDashboardNavigation({ data: { profileRole: "manager" } } as never, { ...availability, isOwnerRole: false, isManagerRole: true } as never));
    expect(result.current.sidebarItems).toEqual(getManagerNavItems(result.current.allSectionItems));
    expect(result.current.sidebarItems.map(item => item.label)).toContain("Repairs");
    expect(result.current.sidebarItems.map(item => item.label)).not.toContain("Vendor Ops");
    act(() => result.current.handleSidebarSelect("maintenance"));
    expect(result.current.activeSection).toBe("maintenance");
  });
});
