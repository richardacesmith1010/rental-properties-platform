import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DomusFinancialsCard
} from "@/components/dashboard/domus-financials-card";
import {
  FinancialOverviewPanel,
  isPlaidBalanceStale,
  resolveInitialFinanceView
} from "@/components/dashboard/financial-overview-panel";
import type { StatefulAction } from "@/components/dashboard/types";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, "/__test_action__"] as const,
    useFormStatus: () => ({ pending: false })
  };
});

function action(): StatefulAction {
  return async () => ({ success: true as const, message: "ok" });
}

const baseProps = {
  accountId: "account-1",
  plaidConnected: true,
  bankName: "First Federal",
  bankMask: "1234",
  balanceCents: 482550,
  balanceUpdatedAt: "2026-03-22T10:00:00.000Z",
  monthlyCollectedCents: 235000,
  monthlyOutstandingCents: 12500,
  monthlyExpensesCents: 21150,
  netIncomeCents: 213850,
  ytdIncomeCents: 705000,
  ytdExpensesCents: 63450,
  collectionRate: 100,
  onInitiatePlaidLink: action(),
  onCompletePlaidLink: action(),
  onRefreshPlaidBalance: action(),
  onDisconnectPlaid: action()
};

describe("financial overview helpers", () => {
  it("treats balances older than four hours as stale", () => {
    expect(
      isPlaidBalanceStale("2026-03-22T06:59:59.000Z", new Date("2026-03-22T11:00:00.000Z").getTime())
    ).toBe(true);
  });

  it("treats recent balances as fresh", () => {
    expect(
      isPlaidBalanceStale("2026-03-22T08:30:00.000Z", new Date("2026-03-22T11:00:00.000Z").getTime())
    ).toBe(false);
  });

  it("defaults to the connected bank view when Plaid is available", () => {
    expect(resolveInitialFinanceView(null, true)).toBe("bank");
  });

  it("falls back to Domus when Plaid is disconnected and Both was saved", () => {
    expect(resolveInitialFinanceView("both", false)).toBe("domus");
  });
});

describe("DomusFinancialsCard", () => {
  it("formats monthly and ytd currency values", () => {
    render(
      React.createElement(DomusFinancialsCard, {
        monthlyCollectedCents: 235000,
        monthlyOutstandingCents: 12500,
        monthlyExpensesCents: 21150,
        netIncomeCents: 213850,
        ytdIncomeCents: 705000,
        ytdExpensesCents: 63450,
        collectionRate: 100
      })
    );

    expect(screen.getByText("$2,350")).toBeInTheDocument();
    expect(screen.getByText("$125")).toBeInTheDocument();
    expect(screen.getByText("$211.50")).toBeInTheDocument();
    expect(screen.getByText("$7,050")).toBeInTheDocument();
  });

  it("shows positive net income with success styling", () => {
    render(
      React.createElement(DomusFinancialsCard, {
        monthlyCollectedCents: 235000,
        monthlyOutstandingCents: 12500,
        monthlyExpensesCents: 21150,
        netIncomeCents: 213850,
        ytdIncomeCents: 705000,
        ytdExpensesCents: 63450,
        collectionRate: 100
      })
    );

    expect(screen.getByText("$2,138.50")).toHaveClass("text-[var(--pos)]");
  });

  it("shows negative net income with danger styling", () => {
    render(
      React.createElement(DomusFinancialsCard, {
        monthlyCollectedCents: 10000,
        monthlyOutstandingCents: 5000,
        monthlyExpensesCents: 25000,
        netIncomeCents: -15000,
        ytdIncomeCents: 50000,
        ytdExpensesCents: 75000,
        collectionRate: 72
      })
    );

    expect(screen.getByText("-$150")).toHaveClass("text-[var(--crit)]");
  });
});

describe("FinancialOverviewPanel", () => {
  let requestSubmitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    requestSubmitSpy.mockRestore();
  });

  it("renders the bank view by default when Plaid is connected", () => {
    render(React.createElement(FinancialOverviewPanel, baseProps));

    expect(screen.getByText("First Federal ••••1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Both" })).toBeInTheDocument();
  });

  it("renders the Domus view by default when Plaid is not connected", () => {
    render(
      React.createElement(FinancialOverviewPanel, {
        ...baseProps,
        plaidConnected: false,
        bankName: null,
        bankMask: null,
        balanceCents: null,
        balanceUpdatedAt: null
      })
    );

    expect(screen.getByText(/Net income/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Both" })).not.toBeInTheDocument();
  });

  it("switches between Domus and Both views and persists the selection", async () => {
    render(React.createElement(FinancialOverviewPanel, baseProps));

    fireEvent.click(screen.getByRole("button", { name: "Domus" }));
    expect(
      screen.getByText("Live rent and expense totals from the records already in Domus.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Both" }));
    expect(screen.getByText("First Federal ••••1234")).toBeInTheDocument();
    expect(screen.getByText(/Net income/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(window.localStorage.getItem("domus-finance-view")).toBe("both");
    });
  });

  it("requests an automatic refresh when the cached balance is stale", async () => {
    render(
      React.createElement(FinancialOverviewPanel, {
        ...baseProps,
        balanceUpdatedAt: "2026-03-22T02:00:00.000Z"
      })
    );

    await waitFor(() => {
      expect(requestSubmitSpy).toHaveBeenCalled();
    });
  });
});
