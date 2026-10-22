import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NeedsYouList } from "@/components/dashboard/owner-home/needs-you-list";

const base = { lateCharges: [], joinedWithoutLease: [], openRepairCount: 0, newMessageCount: 0 };
const props = { bankState: { status: "connected" as const, href: "/connect/onboard" }, onOpenSection: vi.fn() };

describe("NeedsYouList", () => {
  it("hides completely when there is no action", () => {
    const { container } = render(<NeedsYouList {...props} summary={base} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("prioritizes late rent, bank setup, then a new tenant and caps at three", () => {
    const open = vi.fn();
    render(<NeedsYouList {...props} onOpenSection={open}
      bankState={{ status: "needs_info", href: "/connect/onboard", accountName: "J&MSP" }}
      summary={{ lateCharges: [{ id: "c1", tenantName: "Angel" } as never],
        joinedWithoutLease: [{ id: "i1", fullName: "Dana", propertyId: "p1" } as never],
        openRepairCount: 2, newMessageCount: 4 }} onOpenLeaseWizard={vi.fn()} />);
    const rows = screen.getAllByRole("button").map((row) => row.textContent);
    expect(rows).toEqual(["Angel's rent is late", "Dana joined. Set up their lease"]);
    expect(screen.getByRole("link", { name: "Finish J&MSP bank setup" })).toHaveAttribute("href", "/connect/onboard");
    expect(screen.queryByText("2 open repairs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Angel's rent is late" }));
    expect(open).toHaveBeenCalledWith("charges");
  });
  it("shows repairs before messages when higher priority items are absent", () => {
    render(<NeedsYouList {...props} summary={{ ...base, openRepairCount: 2, newMessageCount: 1 }} />);
    expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual(["2 open repairs", "1 new message"]);
  });

  it("opens the first joined tenant lease and selects its property", () => {
    const selectProperty = vi.fn();
    const openLease = vi.fn();
    render(<NeedsYouList {...props} onSelectProperty={selectProperty} onOpenLeaseWizard={openLease}
      summary={{ ...base, joinedWithoutLease: [
        { id: "i1", fullName: "Dana", propertyId: "p1" } as never,
        { id: "i2", fullName: "Sam", propertyId: "p2" } as never
      ] }} />);

    fireEvent.click(screen.getByRole("button", { name: "Dana joined. Set up their lease" }));
    expect(selectProperty).toHaveBeenCalledExactlyOnceWith("p1");
    expect(openLease).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Sam joined. Set up their lease" })).not.toBeInTheDocument();
  });

  it("opens the lease wizard without selecting a property when the invite has none", () => {
    const selectProperty = vi.fn();
    const openLease = vi.fn();
    render(<NeedsYouList {...props} onSelectProperty={selectProperty} onOpenLeaseWizard={openLease}
      summary={{ ...base, joinedWithoutLease: [{ id: "i1", fullName: "Dana", propertyId: null } as never] }} />);

    fireEvent.click(screen.getByRole("button", { name: "Dana joined. Set up their lease" }));
    expect(selectProperty).not.toHaveBeenCalled();
    expect(openLease).toHaveBeenCalledTimes(1);
  });
});
