import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CashOnHandCard } from "@/components/home-money/cash-on-hand-card";
import { DepositReturnSheet } from "@/components/dashboard/deposit-return-sheet";
import { BankBalancesCard } from "@/components/bank-feed/bank-balances-card";
import type { CashOnHand } from "@/lib/cash-on-hand";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const cash: CashOnHand = { accountId: "a1", accountName: "Navy Federal", bankCents: 2188500,
  depositsHeldCents: 375000, yoursCents: 1813500, checkedAt: "2026-10-13T00:00:00Z",
  stale: false, hasBalance: true, complete: true, missingNames: [] };

describe("Sprint 222 cash UI", () => {
  it("shows complete, incomplete, stale and empty states", () => {
    const view = render(<CashOnHandCard accounts={[cash]} />);
    expect(screen.getByText("Cash on hand")).toBeInTheDocument();
    expect(screen.getByText("In the bank")).toBeInTheDocument();
    expect(screen.getByText("Deposits you're holding")).toBeInTheDocument();
    expect(screen.getByText("Yours to use")).toBeInTheDocument();
    expect(screen.getByText("$18,135")).toBeInTheDocument();
    view.rerender(<CashOnHandCard accounts={[{ ...cash, complete: false, missingNames: ["Savings"] }]} />);
    expect(screen.queryByText("Yours to use")).not.toBeInTheDocument();
    expect(screen.getByText("In the bank (some accounts)")).toBeInTheDocument();
    expect(screen.getByText("Add a balance for Savings to see Yours to use.")).toHaveAttribute("href", "/owner/bank");
    view.rerender(<CashOnHandCard accounts={[{ ...cash, stale: true }]} />);
    expect(screen.getByText("Last checked over 3 days ago. Refresh your bank.")).toBeInTheDocument();
    view.rerender(<CashOnHandCard accounts={[]} />);
    expect(screen.getByText("Connect a bank to see cash on hand.")).toBeInTheDocument();
  });
  it("records a partial return and supports undo", async () => {
    const record = vi.fn(async () => ({ ok: true }));
    const clear = vi.fn(async () => ({ ok: true }));
    const view = render(<DepositReturnSheet leaseId="lease" depositCents={235000} recorded={null}
      onRecord={record} onClear={clear} />);
    expect(screen.getByText("Deposit $2,350 · You're holding it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record deposit returned" }));
    expect(screen.getByLabelText("Amount returned")).toHaveValue(2350);
    fireEvent.change(screen.getByLabelText("Amount returned"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(record).toHaveBeenCalledWith({ leaseId: "lease", returnedCents: 200000,
      returnedOn: expect.any(String) }));
    view.rerender(<DepositReturnSheet leaseId="lease" depositCents={235000}
      recorded={{ returned_cents: 200000, returned_on: "2026-03-01" }} onRecord={record} onClear={clear} />);
    expect(screen.getByText("Deposit returned $2,000 on Mar 1, 2026 · Kept $350")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(clear).toHaveBeenCalledWith("lease"));
  });
  it("shows connected balances and updates upload balances only", async () => {
    const save = vi.fn(async () => ({ success: true }));
    render(<BankBalancesCard accounts={[{ id: "u", nickname: "Upload", source: "upload",
      balance_cents: null, balance_as_of: null }, { id: "p", nickname: "Plaid", source: "plaid",
      balance_cents: 10000, balance_as_of: "2026-10-13T00:00:00Z" }]} save={save} />);
    expect(screen.getAllByRole("button", { name: "Update balance" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Update balance" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Balance" }), { target: { value: "123.45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ bankAccountId: "u", balanceCents: 12345 }));
  });
});
