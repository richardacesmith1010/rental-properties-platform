import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YtdTiles } from "@/components/dashboard/owner-home/ytd-tiles";

describe("YtdTiles", () => {
  it("subtracts YTD expenses from actual YTD rent and preserves selected property links", () => {
    render(<YtdTiles incomeCents={125000} expensesCents={40000} selectedPropertyId="p1" year={2026} />);
    expect(screen.getByText("$850")).toHaveClass("text-[var(--pos)]");
    expect(screen.getByText("$1,250")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link"))
      expect(link).toHaveAttribute("href", "/owner/money?month=year&property=p1");
  });
  it("uses red for a loss and a dash with load copy on failure", () => {
    const { rerender } = render(<YtdTiles incomeCents={100} expensesCents={200} year={2026} />);
    expect(screen.getByText("-$1")).toHaveClass("text-[var(--crit)]");
    rerender(<YtdTiles incomeCents={null} expensesCents={200} year={2026} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText("Couldn't load")).toHaveLength(2);
  });
  it("waits for expenses before showing the net", () => {
    render(<YtdTiles incomeCents={1000} expensesCents={500} expensesReady={false} year={2026} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.queryByText("$5")).not.toBeInTheDocument();
  });
});
