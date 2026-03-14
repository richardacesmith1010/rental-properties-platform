import { fireEvent, render, screen } from "@testing-library/react";
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
    const { container } = render(
      <ModalOverlay open>
        <div>Modal content</div>
      </ModalOverlay>
    );

    expect(container.querySelector(".backdrop-blur-sm")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalOverlay open onClose={onClose}>
        <div>Modal content</div>
      </ModalOverlay>
    );

    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledOnce();
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
});
