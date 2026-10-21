import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantBottomBar } from "@/components/dashboard/tenant-bottom-bar";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tenant phone bar", () => {
  it("B2 measures the visible nav, updates on resize, and removes the height on unmount", () => {
    let onResize: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    let height = 84;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ height } as DOMRect));

    const { unmount } = render(<TenantBottomBar activeItemId="overview" />);
    expect(document.documentElement.style.getPropertyValue("--domus-tabbar-height")).toBe("84px");
    height = 0;
    act(() => onResize([], {} as ResizeObserver));
    expect(document.documentElement.style.getPropertyValue("--domus-tabbar-height")).toBe("0px");
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--domus-tabbar-height")).toBe("");
  });

  it("Messages uses the chat icon", () => {
    render(<TenantBottomBar activeItemId="overview" />);
    const nav = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Rent", "Repairs", "Messages"]);
    const messages = within(nav).getByRole("link", { name: "Messages" });
    expect(messages.querySelector(".lucide-message-circle")).not.toBeNull();
    expect(messages.querySelector(".lucide-bell")).toBeNull();
  });
  it("T5 keeps real tab destinations without a client switch", () => {
    render(<TenantBottomBar activeItemId="documents" />);
    const nav = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    expect(within(nav).getByRole("link", { name: "Rent" })).toHaveAttribute("href", "/tenant?section=charges");
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/tenant?section=overview");
    expect(within(nav).getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/tenant?section=notifications");
  });
  it("T5 renders links before JavaScript mounts", () => {
    const html = renderToStaticMarkup(<TenantBottomBar activeItemId="overview" />);
    expect(html).toContain('href="/tenant?section=charges"');
    expect(html).toContain('href="/tenant?section=maintenance"');
  });
});
