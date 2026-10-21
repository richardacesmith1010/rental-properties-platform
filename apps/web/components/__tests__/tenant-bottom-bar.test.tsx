import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenantBottomBar } from "@/components/dashboard/tenant-bottom-bar";
import { renderToStaticMarkup } from "react-dom/server";

describe("tenant phone bar", () => {
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
