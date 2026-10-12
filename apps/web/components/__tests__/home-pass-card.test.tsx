import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePassCard, UnleasedHomeRow } from "@/components/dashboard/owner-home/home-pass-card";
import type { LeaseListItem, PropertyListItem } from "@/lib/portfolio";

const home = { id: "p1", name: "Forum House", city: "Denver", state: "CO", ownerAccountName: "J&MSP" } as PropertyListItem;
const lease = { id: "l1", propertyId: "p1", tenantName: "Maya Bell", monthlyRentCents: 120000,
  dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01", active: true } as LeaseListItem;

describe("HomePassCard", () => {
  it("links the entire rented pass to the home's Money page and shows its own left amount", () => {
    render(<HomePassCard home={home} leases={[lease]} isLate={false} leftCents={32750} index={0} moneyLoaded />);
    const link = screen.getByRole("link", { name: /Forum House/ });
    expect(link).toHaveAttribute("href", "/owner/money?property=p1");
    expect(link).toHaveTextContent("$327.50");
    expect(link).toHaveTextContent("Maya Bell");
    expect(link).toHaveTextContent("Next rent");
    expect(link).toHaveTextContent("Rented");
  });
  it("uses Rent late when a home has a late charge and fails closed for money errors", () => {
    render(<HomePassCard home={home} leases={[lease]} isLate leftCents={0} index={1} moneyLoaded={false} />);
    expect(screen.getByText("Rent late")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
  });
  it("shows no-lease homes as a compact row linking to Homes", () => {
    render(<UnleasedHomeRow home={home} />);
    expect(screen.getByRole("link", { name: /Forum House/ })).toHaveAttribute("href", "/owner/properties/p1");
    expect(screen.getByText("No lease yet")).toBeInTheDocument();
    expect(screen.getByText("J&MSP")).toBeInTheDocument();
  });
});
