import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Receipt } from "lucide-react";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { MobileTopBar, SidebarNav } from "@/components/dashboard/sidebar/sidebar-nav";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import { OwnerSectionCacheContext } from "@/components/dashboard/owner-section-cache";

const rootProps = vi.hoisted(() => vi.fn());
vi.mock("vaul", async () => {
  const actual = await vi.importActual<typeof import("vaul")>("vaul");
  return {
    ...actual,
    Drawer: {
      ...actual.Drawer,
      Root: (props: React.ComponentProps<typeof actual.Drawer.Root>) => {
        rootProps(props);
        return createElement(actual.Drawer.Root, props);
      }
    }
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/owner" }));
vi.mock("@/components/theme-provider", () => ({
  useDomusTheme: () => ({ theme: "light", setTheme: vi.fn() })
}));
vi.mock("@/components/dashboard/sidebar/user-footer", () => ({
  SidebarUserFooter: () => null,
  MobileUserFooter: () => null
}));
vi.mock("@/components/dashboard/notification-bell-menu", () => ({
  NotificationBellMenu: () => null
}));

beforeEach(() => {
  rootProps.mockClear();
  window.history.replaceState(null, "", "/owner");
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()
  });
});

function expectOneScrollArea(dialog: HTMLElement) {
  const scrollers = dialog.querySelectorAll(".overflow-y-auto");
  expect(scrollers).toHaveLength(1);
  expect(scrollers[0]).toHaveClass("overscroll-contain", "touch-pan-y");
}

describe("phone More drawer", () => {
  it("M1 passes handleOnly and left direction to the real vaul Root", () => {
    render(<MobileDrawer open onOpenChange={vi.fn()}>Rows</MobileDrawer>);
    expect(rootProps).toHaveBeenCalledWith(expect.objectContaining({ handleOnly: true, direction: "left" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });

  it("M2 uses a 200 ms slide, no overlay blur, and honors reduced motion", () => {
    render(<MobileDrawer open onOpenChange={vi.fn()}>Rows</MobileDrawer>);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveClass("domus-mobile-drawer");
    const overlay = document.querySelector("[data-vaul-overlay]");
    expect(overlay).toHaveClass("bg-black/45");
    expect(overlay?.className).not.toContain("backdrop-blur");
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    expect(css).toMatch(/\[data-vaul-drawer\]\.domus-mobile-drawer\s*\{[^}]*animation-duration: 200ms !important/);
    expect(css).toMatch(/\[data-vaul-drawer\]\.domus-mobile-drawer\s*\{[^}]*transition-duration: 200ms !important/);
    expect(css).toMatch(/animation-timing-function: cubic-bezier\(0\.2, 0, 0, 1\) !important/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation-duration: 0ms !important/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition-duration: 0ms !important/);
  });

  it("M3 keeps one contained vertical scroller in standalone More", () => {
    render(<OwnerBottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expectOneScrollArea(screen.getByRole("dialog", { name: "Menu" }));
  });

  it("M3 keeps one contained vertical scroller in MobileTopBar More", () => {
    render(<MobileTopBar role="owner" userEmail="owner@example.test" onSignOut={vi.fn()} mobileDrawerOpen />);
    expectOneScrollArea(screen.getByRole("dialog", { name: "Menu" }));
  });

  it("M4 preloads desktop rows on hover and leaves mobile rows alone", () => {
    const cache = { preloadSection: vi.fn(), cancelScheduledPreload: vi.fn() };
    const props = {
      role: "owner", userEmail: "owner@example.test", onSignOut: vi.fn(), onSelectItem: vi.fn(),
      items: [{ id: "charges", label: "Rent", icon: Receipt, group: "Every day" }]
    };
    const mobileView = render(<OwnerSectionCacheContext.Provider value={cache as never}>
      <MobileTopBar {...props} mobileDrawerOpen />
    </OwnerSectionCacheContext.Provider>);
    const mobile = within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "Rent" });
    fireEvent.mouseEnter(mobile);
    expect(cache.preloadSection).not.toHaveBeenCalled();
    mobileView.unmount();
    render(<OwnerSectionCacheContext.Provider value={cache as never}>
      <SidebarNav {...props} />
    </OwnerSectionCacheContext.Provider>);
    const desktop = within(screen.getByRole("navigation", { name: "Main navigation" }))
      .getByRole("button", { name: "Rent" });
    fireEvent.mouseEnter(desktop);
    expect(cache.preloadSection).toHaveBeenCalledWith("charges", 150);
  });

  it("M5 closes on overlay click and Escape", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<MobileDrawer open onOpenChange={onOpenChange}>Rows</MobileDrawer>);
    await userEvent.click(document.querySelector("[data-vaul-overlay]")!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    rerender(<MobileDrawer open onOpenChange={onOpenChange}>Rows</MobileDrawer>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
