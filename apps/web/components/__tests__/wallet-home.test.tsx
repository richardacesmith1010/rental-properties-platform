import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletHome } from "@/components/dashboard/owner-home/wallet-home";
import type { OwnerWalletHomeResult } from "@/lib/owner-wallet-home";

const wallet: Extract<OwnerWalletHomeResult, { ok: true }> = { ok: true, homes: [
  { id: "b", name: "Zenith", city: "Denver", state: "CO", accountId: "llc", accountName: "J&MSP",
    activeLeases: [{ tenantNames: ["Maya"], rentCents: 200000, nextDueDate: "2026-11-01" }],
    isLate: true, leftCents: -4000 },
  { id: "a", name: "Aspen", city: "Boulder", state: "CO", accountId: "personal", accountName: "Personal",
    activeLeases: [{ tenantNames: ["Angel"], rentCents: 100000, nextDueDate: "2026-11-01" }],
    isLate: false, leftCents: 75000 },
  { id: "c", name: "Vacant", city: "Denver", state: "CO", accountId: "llc", accountName: "J&MSP",
    activeLeases: [], isLate: false, leftCents: 0 }
], ytd: { inCents: 100000, outCents: 20000 }, recent: [] };
const summary = { lateCharges: [], openRepairCount: 0, newMessageCount: 0 };
const base = { summary, bankState: { status: "connected" as const, href: "/connect/onboard" },
  onOpenSection: vi.fn() };

describe("WalletHome", () => {
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
