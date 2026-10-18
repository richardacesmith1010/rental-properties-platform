import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenantBottomBar } from "@/components/dashboard/tenant-bottom-bar";

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
});
