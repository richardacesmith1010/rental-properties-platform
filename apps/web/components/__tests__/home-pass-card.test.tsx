import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePassCard, UnleasedHomeRow } from "@/components/dashboard/owner-home/home-pass-card";
import type { WalletHomeEntry } from "@/lib/owner-wallet-home";

const home: WalletHomeEntry = { id: "p1", name: "Forum House", city: "Denver", state: "CO",
  accountId: "a1", accountName: "J&MSP", isLate: false, leftCents: 32750,
  activeLeases: [{ tenantNames: ["Maya Bell"], rentCents: 120000, nextDueDate: "2026-11-01" }] };

describe("HomePassCard", () => {
  it("links the pass to Money and shows rent and net", () => {
    render(<HomePassCard home={home} index={0} />);
    const link = screen.getByRole("link", { name: /Forum House/ });
    expect(link).toHaveAttribute("href", "/owner/money?property=p1");
    expect(link).toHaveTextContent("$327.50");
    expect(link).toHaveTextContent("Maya Bell");
    expect(link).toHaveTextContent("Next rent");
  });
  it("shows late status and account name when supplied", () => {
    render(<HomePassCard home={{ ...home, isLate: true }} index={1} showAccount />);
    expect(screen.getByText("Rent late")).toBeInTheDocument();
    expect(screen.getByText("Denver, CO · J&MSP")).toBeInTheDocument();
  });
  it("shows no-lease homes as a compact row linking to Homes", () => {
    render(<UnleasedHomeRow home={{ ...home, activeLeases: [] }} showAccount />);
    expect(screen.getByRole("link", { name: /Forum House/ })).toHaveAttribute("href", "/owner/properties/p1");
    expect(screen.getByText("No lease yet")).toBeInTheDocument();
    expect(screen.getByText("Denver, CO · J&MSP")).toBeInTheDocument();
  });
});
