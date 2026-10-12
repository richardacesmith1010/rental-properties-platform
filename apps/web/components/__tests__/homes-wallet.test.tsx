import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomesWallet, leaseEndLabel } from "@/components/dashboard/owner-homes/homes-wallet";
import type { OwnerWalletHomeResult, WalletHomeEntry } from "@/lib/owner-wallet-home";

const home: WalletHomeEntry = {
  id: "p1", name: "Forum House", city: "Denver", state: "CO", addressLine1: "123 Forum Ave",
  accountId: "llc", accountName: "J&MSP", accountType: "llc", leaseEndDate: "2027-02-01",
  rentDueThisYear: 9, rentOnTimeThisYear: 9, isLate: false, leftCents: 0,
  activeLeases: [{ tenantNames: ["Maya"], rentCents: 235000, nextDueDate: "2026-11-01" }]
};
const wallet: OwnerWalletHomeResult = { ok: true, homes: [home, { ...home, id: "p2", name: "Aspen",
  accountId: "personal", accountName: "Ace", accountType: "individual", activeLeases: [] }],
  ytd: { inCents: 0, outCents: 0 }, recent: [] };
const handlers = { onAddHome: vi.fn(), onAddTenant: vi.fn(), manageContent: <div>Edit, rename, delete, fee and invitations</div> };

describe("HomesWallet", () => {
  it("5a groups personal account first", () => {
    render(<HomesWallet wallet={wallet} {...handlers} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent))
      .toEqual(["Ace · Personal", "J&MSP · LLC"]);
  });
  it("5b leased card shows four fields and 4c month to month fallback", () => {
    render(<HomesWallet wallet={wallet} {...handlers} />);
    for (const label of ["Tenant", "Rent", "Lease ends", "Paid this year"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("9 of 9 on time")).toBeInTheDocument();
    expect(leaseEndLabel(null)).toBe("Month to month");
  });
  it("5c unleased card calls handler and 5d card links to property", () => {
    render(<HomesWallet wallet={wallet} {...handlers} />);
    expect(screen.getByRole("link", { name: /Forum House/ })).toHaveAttribute("href", "/owner/properties/p1");
    fireEvent.click(screen.getByRole("button", { name: "Add tenant and lease" }));
    expect(handlers.onAddTenant).toHaveBeenCalledWith("p2");
  });
  it("5e Manage homes expands the existing content", () => {
    render(<HomesWallet wallet={wallet} {...handlers} />);
    const button = screen.getByRole("button", { name: "Manage homes" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Edit, rename/)).toBeInTheDocument();
  });
  it("5f exact failure copy retains Manage homes", () => {
    render(<HomesWallet wallet={{ ok: false, error: "load_failed" }} {...handlers} />);
    expect(screen.getByText("Couldn't load your homes. Pull down to try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage homes" })).toBeInTheDocument();
  });
});
