import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeMoneyPage } from "@/components/home-money/home-money-page";
import { MoneyHero } from "@/components/home-money/money-hero";
import { PeriodSwitch } from "@/components/home-money/period-switch";
import * as money from "@/lib/home-money";

const entry: money.Entry = { id: "rent", date: "2026-10-01", kind: "rent", title: "Rent from Maya",
  detail: "Rent", category: "rent", amountCents: 235000, direction: "in", source: "Bank transfer", homeName: "1st Home" };
const base = { property: { id: "home", name: "1st Home" }, entries: [entry],
  totals: { inCents: 235000, outCents: 0, leftCents: 235000 }, alerts: [],
  properties: [{ id: "home", name: "1st Home" }] };
const months = ["2026-10", "2026-09"];

describe("Money components", () => {
  it.each([[100, "text-[var(--pos)]"], [-100, "text-[var(--crit)]"], [0, "text-[var(--ink)]"]])
  ("3a hero color follows %i", (leftCents, css) => {
    render(<MoneyHero label="October" totals={{ inCents: 100, outCents: 100, leftCents }} />);
    expect(screen.getByRole("region", { name: "Money summary" }).querySelectorAll("p")[1]).toHaveClass(css);
  });
  it("3b bar uses the income fraction and is empty at zero", () => {
    const { rerender } = render(<MoneyHero label="October" totals={{ inCents: 25, outCents: 75, leftCents: -50 }} />);
    expect(screen.getByTestId("money-in-fill")).toHaveStyle({ width: "25%" });
    rerender(<MoneyHero label="October" totals={{ inCents: 0, outCents: 0, leftCents: 0 }} />);
    expect(screen.getByTestId("money-in-fill")).toHaveStyle({ width: "0%" });
  });
  it("3c period switch has three segments preserving property", () => {
    render(<PeriodSwitch months={months} selectedMonth="2026-10" propertyId="home" />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "October" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "2026" })).toHaveAttribute("href", "/owner/money?property=home&month=year");
  });
  it("8.6 uses the same neutral surface for the selected segment in both themes", () => {
    render(<PeriodSwitch months={months} selectedMonth="2026-10" propertyId="home" />);
    expect(screen.getByRole("tab", { name: "October" })).toHaveClass(
      "bg-[var(--surface)]", "text-[var(--ink)]", "shadow-[var(--shadow-sm)]"
    );
    expect(screen.getByRole("tab", { name: "September" })).not.toHaveClass("bg-[var(--surface)]");
  });
  it("3d home chips appear with at least two homes", () => {
    const { rerender } = render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    expect(screen.queryByRole("navigation", { name: "Homes" })).not.toBeInTheDocument();
    rerender(<HomeMoneyPage data={{ ...base, property: null, properties: [...base.properties,
      { id: "other", name: "Other" }] }} selectedMonth="2026-10" months={months} />);
    expect(screen.getByRole("link", { name: "All homes" })).toHaveAttribute("href", "/owner/money?month=2026-10");
  });
  it("3e Every item expands with aria-expanded", () => {
    render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    const button = screen.getByRole("button", { name: /Every item/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("3f tax CSV adds Home only for all homes", () => {
    const csv = vi.spyOn(money, "homeMoneyCsv");
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { rerender } = render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "For taxes" }));
    expect(csv).toHaveBeenLastCalledWith(expect.any(Array), false);
    rerender(<HomeMoneyPage data={{ ...base, property: null }} selectedMonth="2026-10" months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "For taxes" }));
    expect(csv).toHaveBeenLastCalledWith(expect.any(Array), true);
    csv.mockRestore(); create.mockRestore(); revoke.mockRestore();
  });
  it("3g Heads up hides when no alerts", () => {
    render(<HomeMoneyPage data={base} selectedMonth="2026-10" months={months} />);
    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  });
});
