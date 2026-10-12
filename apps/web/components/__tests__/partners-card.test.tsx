import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeMoneyPage } from "@/components/home-money/home-money-page";
import { PartnersCard } from "@/components/home-money/partners-card";
import { calculatePartnerReport, type Partner } from "@/lib/partners";

const person: Partner = { id: "p", accountId: "llc", displayName: "Alice", active: true, profileId: null };
const actions = { onAddPartner: vi.fn(), onRenamePartner: vi.fn(), onDeactivatePartner: vi.fn(),
  onAddPayment: vi.fn(), onUpdatePayment: vi.fn(), onDeletePayment: vi.fn() };
function show(planned = false) {
  const report = calculatePartnerReport([person], [{ id: "bill", category: "repair",
    amount_cents: 10000, expense_date: "2026-10-01" }], [{ expense_id: "bill", partner_id: "p" }],
  planned ? [{ id: "pay", fromPartnerId: "p", toPartnerId: null, amountCents: 500,
    paidOn: "2026-10-02", kind: "settle_up", status: "planned", note: null }] : [],
  "all", "2026-10-12");
  render(<PartnersCard accountId="llc" report={report} period="All time" allTimeHref="/all"
    periodHref="/period" {...actions} />);
}
describe("Partners card", () => {
  it("shows The LLC first, Put in and percent; expands all five kinds", () => {
    show();
    const buttons = screen.getAllByRole("button");
    expect(buttons.findIndex((item) => item.textContent?.includes("The LLC"))).toBeLessThan(
      buttons.findIndex((item) => item.textContent?.includes("Alice")));
    fireEvent.click(screen.getByTitle("Show what Alice put in"));
    expect(screen.getByText("Cleaning & repairs")).toBeTruthy();
    expect(screen.getByText("Improvements")).toBeTruthy();
    expect(screen.getByText("Payments in")).toBeTruthy();
    expect(screen.getByText("Payments out")).toBeTruthy();
    expect(screen.getAllByText(/Put in/)).toHaveLength(2);
  });
  it("shows forecast only for planned payments", () => {
    show();
    expect(screen.queryByText("If planned payments go through:")).toBeNull();
  });
  it("hides the card when no single LLC report is supplied", () => {
    render(<HomeMoneyPage data={{ property: null, entries: [], alerts: [], properties: [],
      totals: { inCents: 0, outCents: 0, leftCents: 0 } }} selectedMonth="2026-10" months={["2026-10"]} />);
    expect(screen.queryByLabelText("Partners")).toBeNull();
  });
  it("shows forecast when planned payments exist", () => {
    show(true);
    expect(screen.getByText("If planned payments go through:")).toBeTruthy();
  });
});
