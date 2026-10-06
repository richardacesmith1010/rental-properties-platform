import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalOverlay } from "@/components/ui/modal-overlay";

describe("ModalOverlay", () => {
  it("renders children when open is true", () => {
    render(
      <ModalOverlay open>
        <div>Modal content</div>
      </ModalOverlay>
    );

    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render children when open is false", () => {
    render(
      <ModalOverlay open={false}>
        <div>Modal content</div>
      </ModalOverlay>
    );

    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });

  it("applies the blur backdrop", () => {
    render(
      <ModalOverlay open>
        <div>Modal content</div>
      </ModalOverlay>
    );

    expect(document.body.querySelector(".backdrop-blur-sm")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <ModalOverlay open onClose={onClose}>
        <div>Modal content</div>
      </ModalOverlay>
    );

    const backdrop = document.body.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledOnce();
  });


  it("portals the open dialog above a bottom navigation bar", () => {
    const host = document.createElement("div");
    document.body.append(host);
    try {
      render(<ModalOverlay open><button type="button">Next</button></ModalOverlay>, { container: host });
      const dialog = screen.getByRole("dialog");
      expect(dialog.parentElement).toBe(document.body);
      expect(dialog).toHaveClass("z-[100]");
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    } finally {
      host.remove();
    }
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <ModalOverlay open onClose={onClose}>
        <button type="button">Focusable</button>
      </ModalOverlay>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the dialog, traps Tab, and restores focus on close", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { rerender } = render(
      <ModalOverlay open label="Test dialog"><button type="button">First</button><button type="button">Last</button></ModalOverlay>
    );
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    rerender(<ModalOverlay open={false} label="Test dialog"><button type="button">First</button></ModalOverlay>);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
