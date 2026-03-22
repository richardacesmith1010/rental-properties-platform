import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import {
  buildManagerEditFields,
  buildPropertyEditFields
} from "@/lib/entity-edit-fields";

const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock
  }
}));

describe("EntityEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders property edit fields from the reusable field config", () => {
    render(
      <EntityEditModal
        open
        onClose={() => {}}
        title="Edit Property"
        entityType="property"
        fields={buildPropertyEditFields({
          name: "Atlas House",
          addressLine1: "123 Forum Ave",
          city: "Denver",
          state: "CO",
          postalCode: "80202"
        })}
        onSave={async () => ({})}
      />
    );

    expect(screen.getByRole("textbox", { name: /property name/i })).toHaveValue("Atlas House");
    expect(screen.getByRole("textbox", { name: /street address/i })).toHaveValue("123 Forum Ave");
    expect(screen.getByRole("textbox", { name: /zip code/i })).toHaveValue("80202");
  });

  it("switches manager payment fields when the payment type changes", () => {
    render(
      <EntityEditModal
        open
        onClose={() => {}}
        title="Edit Manager"
        entityType="manager"
        fields={buildManagerEditFields({
          managerName: "Morgan Manager",
          managerEmail: "manager@example.com",
          label: "Management Fee",
          paymentType: "flat",
          percentageRate: null,
          flatAmountCents: 45000,
          baseRentCents: 250000,
          frequency: "monthly"
        })}
        onSave={async () => ({})}
      />
    );

    expect(screen.getByRole("spinbutton", { name: /flat fee/i })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /percentage rate/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /payment type/i }), {
      target: { value: "percentage" }
    });

    expect(screen.getByRole("spinbutton", { name: /percentage rate/i })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /flat fee/i })).not.toBeInTheDocument();
  });

  it("submits only changed values", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue({ message: "Saved." });

    render(
      <EntityEditModal
        open
        onClose={onClose}
        title="Edit Property"
        entityType="property"
        fields={buildPropertyEditFields({
          name: "Atlas House",
          addressLine1: "123 Forum Ave",
          city: "Denver",
          state: "CO",
          postalCode: "80202"
        })}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: /property name/i }), {
      target: { value: "Atlas Villas" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ name: "Atlas Villas" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Saved.");
  });
});
