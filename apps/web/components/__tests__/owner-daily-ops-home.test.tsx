import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerDailyOpsHome } from "@/components/dashboard/owner-daily-ops-home";
import { OwnerSectionCacheContext, type useOwnerSectionCache } from "@/components/dashboard/owner-section-cache";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormState: () => [null, vi.fn()] as const, useFormStatus: () => ({ pending: false }) };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/financial-overview-panel", () => ({
  FinancialOverviewPanel: ({ monthlyExpensesCents }: { monthlyExpensesCents: number }) =>
    <div>Financial details <span>Expenses: {monthlyExpensesCents}</span></div>
}));

const financialOverview = {
  accountId: null, plaidConnected: false, bankName: null, bankMask: null,
  balanceCents: null, balanceUpdatedAt: null, monthlyCollectedCents: 0,
  monthlyOutstandingCents: 0, monthlyExpensesCents: 0, netIncomeCents: 0,
  ytdIncomeCents: 0, ytdExpensesCents: 0, collectionRate: 0
};

const summary = {
  lateCharges: [{
    id: "charge-1", leaseId: "lease-1", propertyId: "property-1",
    dueDate: "2026-10-01", amountCents: 120000, status: "late" as const,
    propertyName: "Forum House", unitNumber: "1A", tenantName: "Maya Bell",
    category: "rent" as const
  }],
  openRepairCount: 0, newMessageCount: 0, collectedCents: 300000,
  dueCents: 500000, homeCount: 2, rentedHomeCount: 1,
  nextDueDate: "2026-11-01", nextDueAmountCents: 240000, nextDueTenantCount: 2
};

describe("OwnerDailyOpsHome", () => {
  it("shows essential rent and tiles while Home bundles load, then fills the deferred areas", () => {
    const loadHome = vi.fn();
    const pendingCache = { hasBundles: () => false, homeError: false, loadHome } as unknown as ReturnType<typeof useOwnerSectionCache>;
    const readyCache = { hasBundles: () => true, homeError: false, loadHome } as unknown as ReturnType<typeof useOwnerSectionCache>;
    const home = (cache: ReturnType<typeof useOwnerSectionCache>, ready: boolean) => (
      <OwnerSectionCacheContext.Provider value={cache}>
        <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
          summary={{ ...summary, openRepairCount: ready ? 2 : 0, joinedWithoutLease: ready ? [{
            id: "invite-1", fullName: "Dana Tenant", propertyId: "property-1"
          } as never] : [] }}
          onOpenSection={vi.fn()} financialOverview={{ ...financialOverview, monthlyExpensesCents: ready ? 7500 : 0 }} />
      </OwnerSectionCacheContext.Provider>
    );
    const { rerender } = render(home(pendingCache, false));
    expect(screen.getByText("Maya Bell owes $1,200")).toBeInTheDocument();
    expect(screen.getByText("$3,000 of $5,000")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading new tenants")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading repairs and messages")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading more numbers")).toBeInTheDocument();
    expect(loadHome).toHaveBeenCalledOnce();
    rerender(home(readyCache, true));
    expect(screen.getByText("Dana Tenant joined. Set up their lease.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 open repairs" })).toBeInTheDocument();
    expect(screen.getByText("Expenses: 7500")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading more numbers")).not.toBeInTheDocument();
  });

  it("shows a refresh message when the deferred Home request fails", () => {
    const cache = { hasBundles: () => false, homeError: true, loadHome: vi.fn() } as unknown as
      ReturnType<typeof useOwnerSectionCache>;
    render(<OwnerSectionCacheContext.Provider value={cache}>
      <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
        summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />
    </OwnerSectionCacheContext.Provider>);
    expect(screen.getByText("Maya Bell owes $1,200")).toBeInTheDocument();
    expect(screen.getAllByText("Some numbers didn't load. Refresh to try again.")).toHaveLength(2);
    expect(screen.queryByText("Expenses: 0")).not.toBeInTheDocument();
  });

  it("hides reminders while notifications are off and keeps Mark as paid", () => {
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.queryByRole("button", { name: "Send reminder" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as paid" })).toBeInTheDocument();
  });

  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))));
  afterEach(() => vi.unstubAllGlobals());

  it("shows a skeleton then fetched home money with a plain month", async () => {
    const response = { ok: true, json: async () => ({ month: "2026-10", moreCount: 0,
      homes: [{ propertyId: "home", name: "1st Home", inCents: 235000, outCents: 103944,
        leftCents: 131056, alertCount: 1 }] }) };
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const { container } = render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(await screen.findByText("1st Home · October")).toBeInTheDocument();
    expect(screen.getByText("1 thing to check")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "/owner/money?property=home");
  });

  it("shows the bank link when the home money request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(await screen.findByText("Numbers are not ready. Try again later.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sort your bank file" })).toHaveAttribute("href", "/owner/bank");
  });

  it("shows one bank card only when setup is needed", () => {
    const { rerender } = render(
      <OwnerDailyOpsHome bankState={{ status: "not_started", href: "/connect/onboard" }}
        summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />
    );
    expect(screen.getAllByText("Connect your bank to get paid")).toHaveLength(1);

    rerender(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.queryByText("Connect your bank to get paid")).not.toBeInTheDocument();
  });

  it("renders late rent actions and summary tiles", async () => {
    const reminder = vi.fn(async (_state: unknown, _formData: FormData) => ({ success: true as const }));
    render(
      <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }} summary={summary} notificationsAreOn
        onOpenSection={vi.fn()} onSendBatchPaymentReminder={reminder} onRecordManualPayment={vi.fn()}
        financialOverview={financialOverview} />
    );

    expect(screen.getByText("Maya Bell owes $1,200")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    await waitFor(() => expect(reminder).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    expect(screen.getByRole("button", { name: "Save Payment" })).toBeInTheDocument();
    expect(screen.getByText("$3,000 of $5,000")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 rented")).toBeInTheDocument();
    expect(screen.getByText("$2,400 from 2 tenants")).toBeInTheDocument();
    expect(screen.getByText("No open repairs. No new messages.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sort your bank file" })).toHaveAttribute("href", "/owner/bank");
  });

  it("renders the manager home without owner-only financial numbers", () => {
    render(
      <OwnerDailyOpsHome
        bankState={{ status: "not_started", href: "/connect/onboard" }}
        isManagerView
        summary={summary}
        onOpenSection={vi.fn()}
        financialOverview={financialOverview}
      />
    );

    expect(screen.getByText("Connect your bank to get your fees")).toBeInTheDocument();
    expect(screen.getByText("Needs you today")).toBeInTheDocument();
    expect(screen.getByText("Homes you manage")).toBeInTheDocument();
    expect(screen.queryByText("More numbers")).not.toBeInTheDocument();
    expect(screen.queryByText("Financial details")).not.toBeInTheDocument();
    expect(screen.queryByText("This month")).not.toBeInTheDocument();
  });

  it("handles a zero-home portfolio", () => {
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={{ ...summary, lateCharges: [], homeCount: 0, rentedHomeCount: 0 }}
      onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.getByText("0 of 0 rented")).toBeInTheDocument();
  });

  it("groups late months and uses all rent for reminders", async () => {
    const reminder = vi.fn(async (_state: unknown, _formData: FormData) => ({ success: true as const }));
    const groupedSummary = {
      ...summary,
      lateCharges: [
        { ...summary.lateCharges[0], id: "oldest", dueDate: "2026-08-01", amountCents: 100 },
        { ...summary.lateCharges[0], id: "newest", dueDate: "2026-09-01", amountCents: 100 }
      ]
    };
    const { container } = render(
      <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }} summary={groupedSummary} notificationsAreOn
        onOpenSection={vi.fn()} onSendBatchPaymentReminder={reminder} onRecordManualPayment={vi.fn()}
        financialOverview={financialOverview} />
    );

    expect(screen.getByText("Maya Bell owes $2 · 2 months late")).toBeInTheDocument();
    expect(screen.getByText("Oldest rent was due Aug 1, 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Send reminder" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    await waitFor(() => expect(reminder).toHaveBeenCalledOnce());
    const reminderData = reminder.mock.calls[0][1] as FormData;
    expect(reminderData.getAll("chargeIds")).toEqual(["oldest", "newest"]);

    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    expect(container.querySelector('input[name="chargeId"]')).toHaveValue("oldest");
  });

  it("omits the rent detail when no rent is due", () => {
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={{ ...summary, lateCharges: [], nextDueDate: null, nextDueAmountCents: 0, nextDueTenantCount: 0 }}
      onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.getByText("No rent due")).toBeInTheDocument();
    expect(screen.queryByText("$0 from 0 tenants")).not.toBeInTheDocument();
  });
});
