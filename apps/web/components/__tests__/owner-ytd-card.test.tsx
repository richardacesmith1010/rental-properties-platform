import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomusFinancialsCard } from "@/components/dashboard/domus-financials-card";

const props = {
  monthlyCollectedCents: 0, monthlyOutstandingCents: 0, monthlyExpensesCents: 0,
  netIncomeCents: 0, ytdExpensesCents: 0, collectionRate: 0
};

describe("owner YTD display", () => {
  it("shows zero received as money", () => {
    render(<DomusFinancialsCard {...props} ytdIncomeCents={0} />);
    expect(screen.getByText("Year-to-date income").parentElement).toHaveTextContent("$0");
  });
  it("shows a load failure without a false number", () => {
    render(<DomusFinancialsCard {...props} ytdIncomeCents={null} />);
    expect(screen.getByText("Year-to-date income").parentElement).toHaveTextContent("—");
    expect(screen.getAllByText("Couldn't load")).toHaveLength(2);
  });
});
