import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletHome } from "@/components/dashboard/owner-home/wallet-home";
import { HomesWallet } from "@/components/dashboard/owner-homes/homes-wallet";
import type { OwnerWalletHomeResult } from "@/lib/owner-wallet-home";

const wallet: Extract<OwnerWalletHomeResult, { ok: true }> = { ok: true, homes: [
  { id: "b", name: "Zenith", city: "Denver", state: "CO", accountId: "llc", accountName: "J&MSP", accountType: "llc", addressLine1: "123 Forum Ave",
    leaseEndDate: "2027-02-01", rentDueThisYear: 9, rentOnTimeThisYear: 9, activeLeases: [{ tenantNames: ["Maya"], rentCents: 200000, nextDueDate: "2026-11-01" }],

  depositCents: 0, depositReturned: false, isLate: true, leftCents: -4000 },
  { id: "a", name: "Aspen", city: "Boulder", state: "CO", accountId: "personal", accountName: "Personal", accountType: "individual", addressLine1: "1 Aspen St",
    leaseEndDate: null, rentDueThisYear: 0, rentOnTimeThisYear: 0, activeLeases: [{ tenantNames: ["Angel"], rentCents: 100000, nextDueDate: "2026-11-01" }],

  depositCents: 0, depositReturned: false, isLate: false, leftCents: 75000 },
  { id: "c", name: "Vacant", city: "Denver", state: "CO", accountId: "llc", accountName: "J&MSP", accountType: "llc", addressLine1: "123 Forum Ave",
    leaseEndDate: "2027-02-01", rentDueThisYear: 9, rentOnTimeThisYear: 9, activeLeases: [],
    depositCents: 0, depositReturned: false, isLate: false, leftCents: 0 }
], ytd: { inCents: 100000, outCents: 20000 }, recent: [], yearRentReceivedByPropertyId: {} };
const summary = { lateCharges: [], openRepairCount: 0, newMessageCount: 0 };
const base = { summary, bankState: { status: "connected" as const, href: "/connect/onboard" },
  onOpenSection: vi.fn() };

describe("WalletHome", () => {
  it("shows Invite sent on Home and Homes only for pending leases", () => {
    const pending = { ...wallet, homes: wallet.homes.map((home) => ({ ...home,
      activeLeases: home.activeLeases.map((lease) => ({ ...lease, invitePending: home.id === "b" })) })) };
    const view = render(<WalletHome {...base} wallet={pending} />);
    expect(screen.getByText("Maya")).toHaveClass("truncate");
    expect(screen.getByText("· Invite sent")).toHaveClass("shrink-0");
    expect(screen.getByText("· Invite sent")).not.toHaveClass("truncate");
    expect(screen.queryByText("Angel · Invite sent")).not.toBeInTheDocument();
    view.unmount();
    render(<HomesWallet wallet={pending} onAddHome={vi.fn()} onAddTenant={vi.fn()} manageContent={null} />);
    expect(screen.getByText("Maya · Invite sent")).toBeInTheDocument();
    expect(screen.queryByText("Angel · Invite sent")).not.toBeInTheDocument();
  });

  it("renders passes for leased homes across accounts in name order", () => {
    render(<WalletHome {...base} wallet={wallet} />);
    const passes = screen.getByLabelText("Rented homes").querySelectorAll("a");
    expect(Array.from(passes, (node) => node.getAttribute("href"))).toEqual([
      "/owner/money?property=a", "/owner/money?property=b"
    ]);
    expect(passes[0]).toHaveTextContent("$750");
    expect(passes[1]).toHaveTextContent("-$40");
  });
  it("shows account names only with multiple accounts", () => {
    const { rerender } = render(<WalletHome {...base} wallet={wallet} />);
    expect(screen.getAllByText("Denver, CO · J&MSP").length).toBeGreaterThan(0);
    rerender(<WalletHome {...base} wallet={{ ...wallet, homes: wallet.homes.map((home) =>
      ({ ...home, accountId: "llc" })) }} />);
    expect(screen.queryByText("Denver, CO · J&MSP")).not.toBeInTheDocument();
  });
  it("shows exact failure copy and empty tiles", () => {
    render(<WalletHome {...base} wallet={{ ok: false, error: "load_failed" }} />);
    expect(screen.getByText("Couldn't load your homes. Pull down to try again.")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
  it("uses all-account isLate for Needs you", () => {
    render(<WalletHome {...base} wallet={wallet} />);
    expect(screen.getByText("Maya's rent is late")).toBeInTheDocument();
  });
});
