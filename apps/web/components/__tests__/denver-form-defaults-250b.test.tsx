import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DepositReturnSheet } from "@/components/dashboard/deposit-return-sheet";
import { createDefaultLeaseWizardDraft } from "@/components/dashboard/lease-wizard-support";
import { YtdTiles } from "@/components/dashboard/owner-home/ytd-tiles";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.useRealTimers());

describe("250b Denver form defaults", () => {
  it.each([
    ["2026-11-01T04:30:00Z", "2026-10-31", "2026-11-01"],
    ["2026-11-01T12:00:00Z", "2026-11-01", "2026-12-01"]
  ])("R6 deposit and lease dates at %s", (instant, today, nextMonth) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    render(<DepositReturnSheet leaseId="l" depositCents={1000} recorded={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Record deposit returned" }));
    expect(screen.getByTitle("Return date")).toHaveAttribute("value", today);
    expect(screen.getByTitle("Return date")).toHaveAttribute("max", today);
    expect(createDefaultLeaseWizardDraft({ properties: [], units: [], leases: [], tenants: [] }).startDate)
      .toBe(nextMonth);
  });

  it("R2 YTD tile default year uses Denver at UTC new year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T05:00:00Z"));
    render(<YtdTiles incomeCents={100} expensesCents={50} />);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});

import { exportChargesCSV, exportExpensesCSV } from "@/lib/csv-export";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { TenantLedgerReport } from "@/components/reports/tenant-ledger-report";
import { DelinquencyReport } from "@/components/reports/delinquency-report";
import { ReceivablesReport } from "@/components/reports/receivables-report";
import { MonthlyPnLReport } from "@/components/reports/monthly-pnl-report";
import { TaxSummaryReport } from "@/components/reports/tax-summary-report";

const csvSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csv-export-reports", () => ({
  downloadReportCsv: csvSpy,
  rentRollToCsv: () => "", tenantLedgerToCsv: () => "", delinquencyToCsv: () => "",
  receivablesToCsv: () => "", monthlyPnlToCsv: () => "", taxSummaryToCsv: () => ""
}));
vi.mock("@/components/reports/report-layout", () => ({
  ReportSection: ({ onExport }: { onExport: () => void }) => <button onClick={onExport}>Export CSV</button>
}));

it.each([
  ["rent roll", "domus-rent-roll", () => <RentRollReport data={[]} />],
  ["tenant ledger", "domus-tenant-ledger", () => <TenantLedgerReport data={[]} />],
  ["delinquency", "domus-delinquency-aging", () => <DelinquencyReport data={[]} />],
  ["receivables", "domus-accounts-receivable", () => <ReceivablesReport data={[]} />],
  ["monthly P&L", "domus-monthly-pnl", () => <MonthlyPnLReport data={[]} />],
  ["tax summary", "domus-tax-summary", () =>
    <TaxSummaryReport data={[]} year={2026} onSave={vi.fn(async () => null)} />]
])("R5 %s CSV uses the Denver file date", (_label, prefix, component) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
  csvSpy.mockClear();
  render(component());
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(csvSpy).toHaveBeenCalledWith(`${prefix}-2026-10-31.csv`, expect.anything());
});

it("R5 analytics CSV exports use the Denver file date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
  csvSpy.mockClear();
  exportChargesCSV([]);
  exportExpensesCSV([]);
  expect(csvSpy.mock.calls.map(([name]) => name)).toEqual([
    "domus-rent-collection-2026-10-31.csv", "domus-expenses-2026-10-31.csv"
  ]);
});

import { ChargeCreateForm } from "@/components/dashboard/charge-create-form";
import { TaskSheet } from "@/components/home-money/task-sheet";
import { PartnerPaymentSheet } from "@/components/home-money/partner-payment-sheet";

it.each([
  ["2026-11-01T04:30:00Z", "2026-10-31", "2026-11-01"],
  ["2026-11-01T12:00:00Z", "2026-11-01", "2026-12-01"]
])("R6 charge, task and partner defaults at %s", (instant, today, nextMonth) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  const form = render(<ChargeCreateForm open leases={[]} onSubmit={vi.fn(async () => null)} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Due Date")).toHaveValue(nextMonth);
  form.unmount();
  const task = render(<TaskSheet accountId="a" partners={[]} onClose={vi.fn()}
    onSave={vi.fn(async () => ({ ok: true as const }))} />);
  expect(screen.getByLabelText("Next due")).toHaveValue(today);
  task.unmount();
  render(<PartnerPaymentSheet accountId="a" partners={[]} onClose={vi.fn()}
    onSave={vi.fn(async () => ({ ok: true as const, data: { id: "p" } }))} />);
  expect(screen.getByLabelText("Date")).toHaveValue(today);
});

import { SettleUpSection } from "@/components/home-money/settle-up-section";
import { exportChargesCsv } from "@/components/dashboard/charges/helpers";

it("R6 settle-up writes Denver today as its planned payment date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
  const save = vi.fn(async () => ({ ok: true as const, data: { id: "p" } }));
  const base = { active: true, paidByKind: { cleaningRepairs: 0, improvements: 0, mortgage: 0,
    utilities: 0, other: 0 }, paymentsInCents: 0, paymentsOutCents: 0, putInCents: 0,
    sharePct: 50, plannedDelta: 0, projectedSharePct: 50 };
  render(<SettleUpSection accountId="a" rows={[
    { ...base, id: "p1", name: "Ace", projectedPutIn: 0 },
    { ...base, id: "p2", name: "Bea", projectedPutIn: 1000 }
  ]} period="All time" allTimeHref="/owner/money" onAddPayment={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Add as planned" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ paidOn: "2026-10-31" }));
});

it("R5 charges CSV uses the Denver file date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
  const create = vi.fn(() => "blob:export");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("charges-export-2026-10-31.csv");
  });
  exportChargesCsv([]);
  expect(click).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  click.mockRestore();
});
