import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeMoneyPage } from "@/components/home-money/home-money-page";
import * as money from "@/lib/home-money";

const base = {
  property: { id: "home", name: "1st Home" }, entries: [],
  totals: { inCents: 0, outCents: 0, leftCents: 0 }, alerts: [],
  properties: [{ id: "home", name: "1st Home" }]
};
const months = ["2026-10", "2026-09", "2026-08"];
describe("HomeMoneyPage", () => {
  it("shows negative left after bills in red with a minus sign", () => {
    render(<HomeMoneyPage data={{ ...base, totals: { inCents: 0, outCents: 14727, leftCents: -14727 } }}
      selectedMonth="2026-10" months={months} />);
    const value = screen.getByText(/\$147\.27/);
    expect(value).toHaveClass("text-[var(--crit)]");
    expect(value.textContent).toMatch(/[-−]/);
  });
  it("shows plain month tabs and their URLs", () => {
    render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    for (const [label, month] of [["Oct", "2026-10"], ["Sep", "2026-09"], ["Aug", "2026-08"]]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/owner/money?property=home&month=${month}`);
    }
    expect(screen.getByRole("link", { name: "This year" }))
      .toHaveAttribute("href", "/owner/money?property=home&month=year");
  });
  it("links the empty state to bank upload", () => {
    render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    expect(screen.getByRole("link", { name: /Upload a bank file/ })).toHaveAttribute("href", "/owner/bank");
  });
  it("builds tax CSV when download is clicked", () => {
    const csv = vi.spyOn(money, "homeMoneyCsv");
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "Download for taxes" }));
    expect(csv).toHaveBeenCalledWith([]);
    expect(screen.getByRole("button", { name: "Download for taxes" }))
      .toHaveAttribute("title", "Download this home's money for taxes.");
    csv.mockRestore(); create.mockRestore(); revoke.mockRestore();
  });
  it("renders stacked rows for small screens and a plain desktop table", () => {
    const entry: money.Entry = { id: "rent", date: "2026-10-01", kind: "rent", title: "Rent from Maya",
      detail: "Rent", category: "rent", amountCents: 235000, direction: "in", source: "Bank transfer" };
    render(<HomeMoneyPage data={{ ...base, entries: [entry] }} selectedMonth="2026-10" months={months} />);
    const stacked = screen.getByTestId("stacked-money-rows");
    expect(stacked).toHaveClass("sm:hidden");
    expect(stacked).toHaveTextContent("Oct 1");
    expect(stacked).toHaveTextContent("Bank transfer");
    expect(stacked).toHaveTextContent("Balance");
    expect(screen.getByRole("table").parentElement).toHaveClass("hidden", "sm:block");
    expect(screen.getByRole("cell", { name: "Rent" })).toBeInTheDocument();
  });
});
