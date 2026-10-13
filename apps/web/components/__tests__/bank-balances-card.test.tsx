import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BankBalancesCard } from "@/components/bank-feed/bank-balances-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("BankBalancesCard", () => {
  const save = vi.fn(async () => ({ success: true }));

  it("renders nothing when there are no upload account rows", () => {
    const view = render(<BankBalancesCard accounts={[]} save={save} />);
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<BankBalancesCard accounts={[{ id: "plaid", nickname: "Connected", source: "plaid",
      balance_cents: null, balance_as_of: null }]} save={save} />);
    expect(screen.queryByRole("region", { name: "Bank balances" })).not.toBeInTheDocument();
    expect(view.container).toBeEmptyDOMElement();
  });

  it("keeps an upload account visible so its first balance can be entered", () => {
    render(<BankBalancesCard accounts={[{ id: "upload", nickname: "Manual", source: "upload",
      balance_cents: null, balance_as_of: null }]} save={save} />);
    expect(screen.getByRole("region", { name: "Bank balances" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update balance" })).toBeInTheDocument();
  });
});
