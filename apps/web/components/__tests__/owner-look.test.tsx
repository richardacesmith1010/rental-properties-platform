import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePassCard } from "@/components/dashboard/owner-home/home-pass-card";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import { PeriodSwitch } from "@/components/home-money/period-switch";
import { HomeMoneyPage } from "@/components/home-money/home-money-page";
import { ReviewCard } from "@/components/bank-feed/review-card";
import type { WalletHomeEntry } from "@/lib/owner-wallet-home";

vi.mock("next/navigation", () => ({ usePathname: () => "/owner" }));
vi.mock("@/components/theme-provider", () => ({
  useDomusTheme: () => ({ theme: "light", setTheme: vi.fn() })
}));

const home: WalletHomeEntry = {
  id: "p1", name: "Forum House", city: "Denver", state: "CO", accountId: "a1", accountName: "J&MSP",
  accountType: "llc", addressLine1: "123 Forum Ave", leaseEndDate: "2027-02-01", rentDueThisYear: 9,
  rentOnTimeThisYear: 9, depositCents: 0, depositReturned: false, isLate: false, leftCents: 32750,
  activeLeases: [{ tenantNames: ["Maya Bell"], rentCents: 120000, nextDueDate: "2026-11-01" }]
};

beforeEach(() => {
  window.history.replaceState(null, "", "/owner");
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe("owner look", () => {
  it("pass card uses the same hero ground for two homes and keeps the visible details", () => {
    render(<><HomePassCard home={home} index={0} /><HomePassCard home={{ ...home, id: "p2", name: "Second Home" }}
      index={1} /></>);
    for (const name of ["Forum House", "Second Home"]) {
      const card = screen.getByRole("link", { name: new RegExp(name) });
      expect(card).toHaveClass("bg-[var(--hero)]", "rounded-[var(--radius-pass)]");
      expect(card).not.toHaveAttribute("style");
      expect(within(card).getByRole("heading", { name })).toHaveClass("font-display");
      expect(within(card).getByText("$327.50")).toHaveClass("font-display");
      expect(card).toHaveTextContent("Maya Bell");
      expect(card).toHaveTextContent("Next rent");
    }
  });

  it("tab bar uses ink for its border and active Home tab", () => {
    render(<OwnerBottomBar onOpenMore={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Owner shortcuts" });
    expect(nav).toHaveClass("border-[var(--ink)]");
    const active = within(nav).getByRole("link", { name: "Home" });
    expect(active).toHaveClass("text-[var(--ink)]");
    expect(active).not.toHaveClass("text-[var(--accent)]");
  });

  it("period switch selects on surface and keeps its labels", () => {
    render(<PeriodSwitch months={["2026-10", "2026-09"]} selectedMonth="2026-10" propertyId="home" />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["October", "September", "2026"]);
    const selected = screen.getByRole("tab", { name: "October" });
    expect(selected).toHaveClass("bg-[var(--surface)]");
    expect(selected.className).not.toContain("bg-[var(--accent)]");
  });

  it("money title and left after bills amount use the display font", () => {
    const data = { property: { id: "home", name: "Forum House" }, entries: [], alerts: [],
      properties: [{ id: "home", name: "Forum House" }],
      totals: { inCents: 32750, outCents: 0, leftCents: 32750 } };
    render(<HomeMoneyPage data={data} selectedMonth="2026-10" months={["2026-10", "2026-09"]} />);
    expect(screen.getByRole("heading", { name: "Money" })).toHaveClass("font-display");
    expect(screen.getByText("$327.50")).toHaveClass("font-display");
    expect(screen.getByText("$327.50")).toBeInTheDocument();
  });

  it("bank review confirmation uses the action fill", () => {
    render(<ReviewCard item={{ i: 0, token: "token", ruleable: true,
      suggestion: { text: "Mortgage", kind: "expense", propertyId: "home", category: "mortgage", label: "Mortgage" } }}
      row={{ postedOn: "2026-10-01", amountCents: 103944, direction: "out", description: "Transfer To Mortgage" }}
      properties={[{ id: "home", name: "Forum House" }]} charges={[]}
      onAnswer={vi.fn(async () => ({ success: true, bankTransactionId: "item", createdRecord: true }))}
      onUndo={vi.fn(async () => ({ success: true }))} />);
    expect(screen.getByRole("button", { name: "Yes, that's right" })).toHaveClass("bg-[var(--action)]");
  });
});
