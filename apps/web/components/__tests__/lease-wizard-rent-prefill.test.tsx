import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeaseWizard } from "@/components/dashboard/lease-wizard";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const properties = [{
  id: "p1", name: "Maple", addressLine1: "1 Maple", city: "Denver", state: "CO", postalCode: "80000",
  managementFeeCents: 0, unitCount: 2, ownerAccountId: null, ownerAccountName: "Owner",
  ownerAccountIsClient: false, active: true
}];
const units = [185000, 200000].map((monthlyRentCents, index) => ({
  id: `u${index + 1}`, propertyId: "p1", propertyName: "Maple", unitNumber: `${index + 1}`,
  bedrooms: 2, bathrooms: 1, monthlyRentCents, squareFeet: null, occupied: false, active: true
}));

describe("LeaseWizard rent prefill", () => {
  it("fills selected unit rent and preserves rent typed by the owner", async () => {
    render(<LeaseWizard
      open properties={properties} units={units} leases={[]} tenants={[]} selectedPropertyId="p1"
      onOpenChange={vi.fn()} onCreateLease={vi.fn()} onOpenSection={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Vacant unit"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const rent = screen.getByLabelText("Monthly rent");
    await waitFor(() => expect(rent).toHaveValue(1850));
    fireEvent.change(rent, { target: { value: "1900" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByLabelText("Vacant unit"), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText("Vacant unit"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Monthly rent")).toHaveValue(1900);
  });
});
