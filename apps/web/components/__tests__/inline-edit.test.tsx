import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEdit } from "@/components/dashboard/inline-edit";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError
  }
}));

describe("InlineEdit", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("enters edit mode when clicked", () => {
    render(<InlineEdit value="Atlas House" onSave={async () => ({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Atlas House" }));

    expect(screen.getByDisplayValue("Atlas House")).toBeInTheDocument();
  });

  it("saves on Enter and reports success", async () => {
    const onSave = vi.fn(async () => ({ message: "Property renamed." }));
    render(<InlineEdit value="Atlas House" onSave={onSave} successMessage="Saved." />);

    fireEvent.click(screen.getByRole("button", { name: "Atlas House" }));
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "Imperium Flats" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("Imperium Flats");
    });
    expect(toastSuccess).toHaveBeenCalledWith("Property renamed.");
  });

  it("cancels on Escape", () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Atlas House" onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Atlas House" }));
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "Imperium Flats" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Imperium Flats")).not.toBeInTheDocument();
    expect(screen.getByText("Atlas House")).toBeInTheDocument();
  });

  it("blocks save when validation fails", async () => {
    const onSave = vi.fn();
    render(
      <InlineEdit
        value="Atlas House"
        onSave={onSave}
        validate={(value) => (value.length < 3 ? "Too short" : null)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Atlas House" }));
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Too short")).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Too short");
  });
});
