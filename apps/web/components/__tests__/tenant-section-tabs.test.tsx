import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantSectionTabs } from "@/components/dashboard/tenant-section-tabs";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));

function renderTabs() {
  return render(<TenantSectionTabs initialSection="overview" displayName="Taylor"
    overview={<><a href="/tenant?section=maintenance">See repairs</a>
      <a href="/tenant?section=documents">Lease documents</a></>}
    charges={<p>Rent content</p>}
    maintenance={<p>Repairs content</p>}
    notifications={<label>Draft message<input aria-label="Draft message" /></label>}
  />);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/tenant?section=overview");
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  routerPush.mockClear();
});

describe("tenant section tabs", () => {
  it("T2 switches Rent without a request and focuses its heading", () => {
    const push = vi.spyOn(window.history, "pushState");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderTabs();
    const bar = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    fireEvent.click(within(bar).getByRole("link", { name: "Rent" }));
    expect(push).toHaveBeenCalledWith(null, "", "/tenant?section=charges");
    expect(screen.getByText("Rent content").closest("[data-tenant-section]")).not.toHaveAttribute("hidden");
    expect(screen.getByText("See repairs").closest("[data-tenant-section]")).toHaveAttribute("hidden");
    expect(within(bar).getByRole("link", { name: "Rent" })).toHaveAttribute("aria-current", "page");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Rent", level: 2 }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    push.mockRestore();
  });

  it("T3 restores Repairs on popstate", () => {
    renderTabs();
    window.history.replaceState(null, "", "/tenant?section=maintenance");
    fireEvent.popState(window);
    expect(screen.getByText("Repairs content").closest("[data-tenant-section]")).not.toHaveAttribute("hidden");
    expect(screen.getByText("Rent content").closest("[data-tenant-section]")).toHaveAttribute("hidden");
  });

  it("T4 preserves a message draft while its section is hidden", () => {
    renderTabs();
    const bar = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    fireEvent.click(within(bar).getByRole("link", { name: "Messages" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Draft message" }), { target: { value: "Hello" } });
    fireEvent.click(within(bar).getByRole("link", { name: "Home" }));
    fireEvent.click(within(bar).getByRole("link", { name: "Messages" }));
    expect(screen.getByRole("textbox", { name: "Draft message" })).toHaveValue("Hello");
  });

  it("switches in-page section links and keeps a real destination", () => {
    renderTabs();
    const link = screen.getByRole("link", { name: "See repairs" });
    expect(link).toHaveAttribute("href", "/tenant?section=maintenance");
    fireEvent.click(link);
    expect(screen.getByText("Repairs content").closest("[data-tenant-section]")).not.toHaveAttribute("hidden");
  });

  it("T5 leaves documents as a server navigation", () => {
    const push = vi.spyOn(window.history, "pushState");
    renderTabs();
    const link = screen.getByRole("link", { name: "Lease documents" });
    expect(link).toHaveAttribute("href", "/tenant?section=documents");
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("refreshes all mounted section content from new server props", () => {
    const { rerender } = renderTabs();
    const bar = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    fireEvent.click(within(bar).getByRole("link", { name: "Rent" }));
    rerender(<TenantSectionTabs initialSection="charges" displayName="Taylor"
      overview={<p>New home data</p>} charges={<p>New rent data</p>}
      maintenance={<p>New repair data</p>} notifications={<p>New messages</p>} />);
    expect(screen.getByText("New rent data").closest("[data-tenant-section]")).not.toHaveAttribute("hidden");
    expect(screen.getByText("New home data").closest("[data-tenant-section]")).toHaveAttribute("hidden");
    expect(screen.getByText("New repair data")).toBeInTheDocument();
    expect(screen.getByText("New messages")).toBeInTheDocument();
  });
});
