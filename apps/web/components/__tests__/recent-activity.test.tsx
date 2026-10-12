import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentActivity } from "@/components/dashboard/owner-home/recent-activity";
import type { OwnerHomeMoneyResult } from "@/lib/owner-recent-activity";

describe("RecentActivity", () => {
  it("shows five newest items across homes, with the correct amount colors", () => {
    const money: OwnerHomeMoneyResult = { ok: true, leftByPropertyId: {}, items: Array.from({ length: 7 }, (_, i) => ({
      id: String(i), date: `2026-10-${String(i + 1).padStart(2, "0")}`, title: `Item ${i}`,
      amountCents: 1000, direction: i % 2 ? "out" as const : "in" as const,
      propertyId: "p1", propertyName: "Forum House"
    })) };
    render(<RecentActivity money={money} />);
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Item [2-6]/)).toHaveLength(5);
    expect(screen.getByText("Item 6").parentElement?.parentElement?.textContent).toContain("+$10");
    expect(screen.getAllByText("+$10")[0]).toHaveClass("text-[var(--pos)]");
    expect(screen.getAllByText("−$10")[0]).toHaveClass("text-[var(--ink)]");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/owner/money");
  });
  it("fails closed with a clear message", () => {
    render(<RecentActivity money={{ ok: false, error: "load_failed" }} />);
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.queryByText(/\$10/)).not.toBeInTheDocument();
  });
});
