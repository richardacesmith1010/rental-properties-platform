import * as React from "react";
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

function InlineEditHarness({
  initialValue = "Atlas House",
  onSave,
  validate
}: {
  initialValue?: string;
  onSave?: (newValue: string) => Promise<{ error?: string; message?: string } | void>;
  validate?: (value: string) => string | null;
}) {
  const [value, setValue] = React.useState(initialValue);

  return (
    <InlineEdit
      value={value}
      onSave={async (newValue) => {
        const result = await onSave?.(newValue);
        if (!result?.error) {
          setValue(newValue);
        }
        return result;
      }}
      validate={validate}
    />
  );
}

describe("InlineEdit", () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("enters edit mode when clicked", () => {
    render(<InlineEditHarness onSave={async () => ({})} />);

    fireEvent.click(screen.getByRole("button", { name: /click to edit/i }));

    expect(screen.getByDisplayValue("Atlas House")).toBeInTheDocument();
  });

  it("saves on Enter and reports success", async () => {
    const onSave = vi.fn(async () => ({ message: "Property renamed." }));
    render(<InlineEditHarness onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /click to edit/i }));
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "Imperium Flats" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("Imperium Flats");
    });
    expect(toastSuccess).toHaveBeenCalledWith("Property renamed.");
  });

  it("cancels on Escape", async () => {
    const onSave = vi.fn();
    render(<InlineEditHarness onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /click to edit/i }));
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "Imperium Flats" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Imperium Flats")).not.toBeInTheDocument();
    expect(screen.getByText("Atlas House")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /click to edit/i }));
    });
  });

  it("returns focus to the trigger after a successful save", async () => {
    const onSave = vi.fn(async () => ({ message: "Property renamed." }));
    render(<InlineEditHarness onSave={onSave} />);

    const trigger = screen.getByRole("button", { name: /click to edit/i });
    fireEvent.click(trigger);
    const input = screen.getByDisplayValue("Atlas House");
    fireEvent.change(input, { target: { value: "Imperium Flats" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("Imperium Flats");
      expect(screen.getByRole("button", { name: /click to edit/i })).toHaveTextContent("Imperium Flats");
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /click to edit/i }));
    });
  });

  it("blocks save when validation fails", async () => {
    const onSave = vi.fn();
    render(
      <InlineEditHarness
        onSave={onSave}
        validate={(value) => (value.length < 3 ? "Too short" : null)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /click to edit/i }));
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
