import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import type { NavItem } from "@/components/dashboard/sidebar/nav-items";

const items = [{ id: "charges", badgeCount: 2 }] as NavItem[];

describe("OwnerBottomBar", () => {
  it("portals shortcuts into document.body with actions and the late badge", async () => {
    const onSelectItem = vi.fn();
    const onOpenMore = vi.fn();
    const layout = document.createElement("div");
    document.body.append(layout);

    const { container } = render(
      <OwnerBottomBar items={items} activeItemId="overview" onSelectItem={onSelectItem} onOpenMore={onOpenMore} />,
      { container: layout }
    );

    const nav = await screen.findByRole("navigation", { name: "Owner shortcuts" });
    expect(container).not.toContainElement(nav);
    expect(document.body).toContainElement(nav);
    expect(nav).toHaveClass("fixed", "inset-x-0", "bottom-0", "lg:hidden");
    expect(screen.getByText("2 late")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onSelectItem).toHaveBeenCalledWith("overview");
    expect(onOpenMore).toHaveBeenCalledOnce();

    layout.remove();
  });
});
