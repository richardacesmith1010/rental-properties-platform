import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaseWizard } from "@/components/dashboard/lease-wizard";
import type { ComponentProps } from "react";

const success = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success, error: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ refresh }) }));

const properties = [{
  id: "p1", name: "Maple House", addressLine1: "1 Maple St", city: "Denver", state: "CO", postalCode: "80000",
  managementFeeCents: 0, unitCount: 1, ownerAccountId: null, ownerAccountName: "Owner",
  ownerAccountIsClient: false, active: true
}];
const units = [{
  id: "u1", propertyId: "p1", propertyName: "Maple House", unitNumber: "A", bedrooms: 2, bathrooms: 1,
  monthlyRentCents: 185000, squareFeet: null, occupied: false, active: true
}];
const tenants = [{ id: "t1", email: "angel@example.com", fullName: "Angel Hernandez", phone: null, propertyIds: ["p1"] }];

function makeProps(overrides: Record<string, unknown> = {}): ComponentProps<typeof LeaseWizard> {
  return {
    open: true, properties, units, leases: [], tenants, selectedPropertyId: "p1", onOpenChange: vi.fn(),
    onCreateLease: vi.fn().mockResolvedValue({ success: true }), onOpenSection: vi.fn(), ...overrides
  } as ComponentProps<typeof LeaseWizard>;
}

async function createLease() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Create Lease" }));
}

describe("LeaseWizard success confirmation", () => {
  beforeEach(() => {
    success.mockClear();
    refresh.mockClear();
  });

  it("confirms an existing tenant lease and opens leases", async () => {
    const props = makeProps();
    render(<LeaseWizard {...props} />);
    await createLease();
    await waitFor(() => expect(success).toHaveBeenCalledWith("Lease created for Angel Hernandez."));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onOpenSection).toHaveBeenCalledWith("leases");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the new tenant full name in the success toast", async () => {
    const props = makeProps({ onSendTenantInvite: vi.fn().mockResolvedValue({ success: true, tenantProfileId: "t2" }) });
    render(<LeaseWizard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite new tenant" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Lee" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lease" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Lease created for Jordan Lee."));
  });

  it("shows a failed action message without a success toast", async () => {
    const props = makeProps({ onCreateLease: vi.fn().mockResolvedValue({ success: false, error: "X" }) });
    render(<LeaseWizard {...props} />);
    await createLease();
    expect(await screen.findByText("X")).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });
});
