import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserMenuPopover } from "@/components/dashboard/user-menu-popover";

describe("UserMenuPopover", () => {
  it("starts closed and closes on outside tap and Escape", () => {
    render(
      <div>
        <button type="button">Outside</button>
        <UserMenuPopover
          displayName="Courtney"
          role="owner"
          userEmail="owner@example.com"
          placement="bottom"
          compact
        />
      </div>
    );

    const trigger = screen.getByTitle("Open user menu.");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
  });
});
