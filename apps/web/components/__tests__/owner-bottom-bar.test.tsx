import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerBottomBar, resolveOwnerTab } from "@/components/dashboard/owner-bottom-bar";
import OwnerLayout from "@/app/owner/layout";
import { MessageCircle, Receipt } from "lucide-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({ path: "/owner" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/components/theme-provider", () => ({
  useDomusTheme: () => ({ theme: "light", setTheme: vi.fn() })
}));

const items = [
  { id: "charges", label: "Rent", icon: Receipt, badgeCount: 2 },
  { id: "inbox", label: "Inbox", icon: MessageCircle, badgeCount: 3 }
];

beforeEach(() => {
  state.path = "/owner";
  window.history.replaceState(null, "", "/owner");
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe("owner phone bar", () => {
  it.each([
    ["/owner", null, "Home"], ["/owner", "overview", "Home"],
    ["/owner/money", null, "Money"], ["/owner/bank", null, "Money"],
    ["/owner", "portfolio", "Homes"], ["/owner", "units", "Homes"],
    ["/owner", "leases", "Homes"], ["/owner", "tenants", "Homes"],
    ["/owner/properties/id", null, "Homes"], ["/owner", "inbox", "Inbox"],
    ["/owner", "charges", "More"]
  ])("marks %s %s as %s", (path, section, expected) => {
    expect(resolveOwnerTab(path, section)).toBe(expected);
  });

  it("renders five real destinations and one readable late badge", () => {
    const open = vi.fn();
    render(<OwnerBottomBar items={items} activeItemId="overview" onOpenMore={open} />);
    const nav = screen.getByRole("navigation", { name: "Owner shortcuts" });
    expect(screen.getAllByRole("navigation", { name: "Owner shortcuts" })).toHaveLength(1);
    expect(Array.from(nav.children).map((child) => child.getAttribute("aria-label")))
      .toEqual(["Home, 2 late rent payments", "Money", "Homes", "Inbox, 3 unread", "More"]);
    expect(within(nav).getByRole("link", { name: "Home, 2 late rent payments" })).toHaveAttribute("href", "/owner");
    expect(within(nav).getByRole("link", { name: "Money" })).toHaveAttribute("href", "/owner/money");
    expect(within(nav).getByRole("link", { name: "Homes" })).toHaveAttribute("href", "/owner?section=portfolio");
    expect(within(nav).getByRole("link", { name: "Inbox, 3 unread" })).toHaveAttribute("href", "/owner?section=inbox");
    expect(within(nav).getByRole("link", { name: "Home, 2 late rent payments" }))
      .toHaveAttribute("aria-current", "page");
    expect(nav.querySelectorAll("[aria-hidden='true']")).not.toHaveLength(0);
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("shows notification count on More and hides it at zero", () => {
    const { rerender } = render(<OwnerBottomBar unreadNotificationCount={4} onOpenMore={vi.fn()} />);
    expect(screen.getByRole("button", { name: "More, 4 unread notifications" })).toBeInTheDocument();
    rerender(<OwnerBottomBar unreadNotificationCount={0} onOpenMore={vi.fn()} />);
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unread notifications/ })).not.toBeInTheDocument();
  });

  it.each(["/owner/money", "/owner/bank"])("shows one Money-active bar on %s", (path) => {
    state.path = path;
    window.history.replaceState(null, "", `${path}?account=account-a&property=home-a`);
    render(<OwnerBottomBar />);
    const nav = screen.getByRole("navigation", { name: "Owner shortcuts" });
    expect(screen.getAllByRole("navigation", { name: "Owner shortcuts" })).toHaveLength(1);
    expect(within(nav).getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Homes" }))
      .toHaveAttribute("href", "/owner?account=account-a&property=home-a&section=portfolio");
  });

  it("opens and closes the standalone More drawer by keyboard", () => {
    render(<OwnerBottomBar />);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("covers owner property and report routes without duplicating Money or Bank bars", () => {
    state.path = "/owner/properties/home-a";
    const { rerender } = render(<OwnerLayout><main>Property</main></OwnerLayout>);
    expect(screen.getAllByRole("navigation", { name: "Owner shortcuts" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Homes" })).toHaveAttribute("aria-current", "page");
    state.path = "/owner/reports";
    rerender(<OwnerLayout><main>Reports</main></OwnerLayout>);
    expect(screen.getAllByRole("navigation", { name: "Owner shortcuts" })).toHaveLength(1);
    state.path = "/owner/money";
    rerender(<OwnerLayout><main>Money</main></OwnerLayout>);
    expect(screen.queryByRole("navigation", { name: "Owner shortcuts" })).not.toBeInTheDocument();
  });

  it("keeps bottom space and one bar in dashboard, Money and Bank page branches", () => {
    const source = (name: string) => readFileSync(resolve(__dirname, `../../${name}`), "utf8");
    expect(source("components/dashboard/dashboard-layout.tsx"))
      .toContain("pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]");
    for (const page of ["app/owner/money/page.tsx", "app/owner/bank/page.tsx"]) {
      const text = source(page);
      expect(text).toContain("<OwnerBottomBar />");
      expect(text).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]");
    }
  });
});
