import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletHome } from "@/components/dashboard/owner-home/wallet-home";
import type { PortfolioData } from "@/lib/portfolio";

const portfolio = { properties: [
  { id: "b", name: "Zenith", city: "Denver", state: "CO", ownerAccountName: "J&MSP" },
  { id: "a", name: "Aspen", city: "Boulder", state: "CO", ownerAccountName: "J&MSP" },
  { id: "c", name: "Vacant", city: "Denver", state: "CO", ownerAccountName: "J&MSP" }
], leases: [
  { id: "l1", propertyId: "a", tenantName: "Angel", monthlyRentCents: 100000,
    dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01", active: true },
  { id: "l2", propertyId: "b", tenantName: "Maya", monthlyRentCents: 200000,
    dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01", active: true }
], units: [], tenants: [] } as unknown as PortfolioData;
const money = { ok: true as const, leftByPropertyId: { a: 75000, b: -4000 }, items: [] };
const summary = { lateCharges: [{ propertyId: "b" } as never], openRepairCount: 0, newMessageCount: 0 };

describe("WalletHome", () => {
  it("orders rented passes by name, uses each home's net, and puts unleased homes below", () => {
    render(<WalletHome portfolio={portfolio} summary={summary} money={money}
      bankState={{ status: "connected", href: "/connect/onboard" }} ytdIncomeCents={100000}
      ytdExpensesCents={20000} onOpenSection={vi.fn()} />);
    const passes = screen.getByLabelText("Rented homes").querySelectorAll("a");
    expect(Array.from(passes, (node) => node.getAttribute("href"))).toEqual([
      "/owner/money?property=a", "/owner/money?property=b"
    ]);
    expect(passes[0]).toHaveTextContent("$750");
    expect(passes[1]).toHaveTextContent("-$40");
    expect(passes[1]).toHaveTextContent("Rent late");
    expect(screen.getByLabelText("Homes without a lease")).toHaveTextContent("Vacant");
    expect(screen.getByRole("link", { name: /Vacant/ })).toHaveAttribute("href", "/owner/properties/c");
  });
  it("keeps title-owned section order: passes, tiles, Needs you, activity", () => {
    const { container } = render(<WalletHome portfolio={portfolio} summary={{ ...summary, openRepairCount: 1 }} money={money}
      bankState={{ status: "connected", href: "/connect/onboard" }} ytdIncomeCents={100000}
      ytdExpensesCents={20000} onOpenSection={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Aspen")).toBeLessThan(text.indexOf("2026 so far"));
    expect(text.indexOf("2026 so far")).toBeLessThan(text.indexOf("Needs you"));
    expect(text.indexOf("Needs you")).toBeLessThan(text.indexOf("Recent activity"));
  });
});
