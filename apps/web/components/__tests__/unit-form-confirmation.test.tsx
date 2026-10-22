import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitForm } from "@/components/dashboard/forms/unit-form";

const stateRef = vi.hoisted(() => ({ current: null as { success?: boolean } | null }));
const success = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormState: () => [stateRef.current, vi.fn()] };
});
vi.mock("sonner", () => ({ toast: { success, error: vi.fn() } }));

describe("UnitForm success confirmation", () => {
  beforeEach(() => {
    stateRef.current = null;
    success.mockClear();
  });

  it("confirms once and resets the unit draft for the same success state", async () => {
    const onUnitCreated = vi.fn();
    const props = {
      portfolio: { properties: [{ id: "p1", name: "Maple" }] } as never,
      onCreateUnit: vi.fn(),
      onUnitCreated,
      onBack: vi.fn(),
      initialPropertyId: "p1"
    };
    const { rerender } = render(<UnitForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText(/^Unit Number/), { target: { value: "D" } });

    const state = { success: true };
    stateRef.current = state;
    rerender(<UnitForm {...props} />);

    await waitFor(() => expect(success).toHaveBeenCalledWith("Unit D added."));
    expect(success).toHaveBeenCalledTimes(1);
    expect(onUnitCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Step 1: Pick the property this unit belongs to.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText(/^Unit Number/)).toHaveValue("");

    rerender(<UnitForm {...props} />);
    expect(success).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith("Unit D added.");
  });

  it("confirms a second unit once after a remount with the prior success state", async () => {
    const onUnitCreated = vi.fn();
    const props = {
      portfolio: { properties: [{ id: "p1", name: "Maple" }] } as never,
      onCreateUnit: vi.fn(),
      onUnitCreated,
      onBack: vi.fn(),
      initialPropertyId: "p1"
    };
    const first = render(<UnitForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText(/^Unit Number/), { target: { value: "D" } });

    stateRef.current = { success: true };
    first.rerender(<UnitForm {...props} />);
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(success).toHaveBeenCalledWith("Unit D added.");
    first.unmount();

    const second = render(<UnitForm {...props} />);
    expect(success).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText(/^Unit Number/), { target: { value: "E" } });

    stateRef.current = { success: true };
    second.rerender(<UnitForm {...props} />);
    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    expect(success).toHaveBeenNthCalledWith(2, "Unit E added.");
    expect(onUnitCreated).toHaveBeenCalledTimes(2);
    second.rerender(<UnitForm {...props} />);
    expect(success).toHaveBeenCalledTimes(2);
  });
});
