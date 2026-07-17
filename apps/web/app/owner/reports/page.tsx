import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireRole, getRoleHomePath } from "@/lib/auth";
import { editCharge, deleteCharge, waiveCharge, updateExpense } from "@/app/actions";
import {
  getDelinquencyReport,
  getMonthlyPnLReport,
  getReceivablesReport,
  getRentRollReport,
  getTaxSummaryReport,
  getTenantLedgerReport,
} from "@/lib/reports";
import { ReportCard } from "@/components/reports/report-layout";
import { DrilldownPanel } from "@/components/reports/drilldown-panel";
import { DelinquencyReport } from "@/components/reports/delinquency-report";
import { MonthlyPnLReport } from "@/components/reports/monthly-pnl-report";
import { ReceivablesReport } from "@/components/reports/receivables-report";
import { RentRollReport } from "@/components/reports/rent-roll-report";
import { TaxSummaryReport } from "@/components/reports/tax-summary-report";
import { TenantLedgerReport } from "@/components/reports/tenant-ledger-report";

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams?: {
    year?: string | string[];
  };
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { user, role } = await requireRole(["owner", "manager"]);
  const selectedYear = Number(
    typeof searchParams?.year === "string"
      ? searchParams.year
      : Array.isArray(searchParams?.year)
        ? searchParams.year[0]
        : new Date().getUTCFullYear()
  );
  const reportYear = Number.isFinite(selectedYear) ? selectedYear : new Date().getUTCFullYear();

  if (role !== "owner" && role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  const [rentRoll, delinquency, tenantLedger, monthlyPnl, taxSummary, receivables] = await Promise.all([
    getRentRollReport(user.id),
    getDelinquencyReport(user.id),
    getTenantLedgerReport(user.id),
    getMonthlyPnLReport(user.id, reportYear),
    getTaxSummaryReport(user.id, reportYear),
    getReceivablesReport(user.id),
  ]);

  const yearOptions = Array.from({ length: 4 }, (_, index) => new Date().getUTCFullYear() - index);
  const reportsBasePath = role === "manager" ? "/owner/reports" : "/owner/reports";
  const openBalanceCents = receivables.reduce((sum, item) => sum + item.totalOwedCents, 0);
  const netIncomeCents = monthlyPnl.reduce((sum, row) => sum + row.netIncome, 0);
  const tenantCount = tenantLedger.length;
  const receivableCharges = receivables.flatMap((item) => item.chargeDetails);
  const paidCharges = monthlyPnl.flatMap((row) => row.incomeLineItems);
  const expenseItems = monthlyPnl.flatMap((row) => row.expenseLineItems);
  const tenantBalances = tenantLedger.map((ledger) => ({
    tenantName: ledger.tenantName,
    tenantEmail: ledger.tenantEmail,
    currentBalanceCents: ledger.currentBalance,
    chargeCount: ledger.entries.filter((entry) => entry.type === "charge" && entry.amount > 0).length
  }));

  return (
    <main id="main-content" className="app-surface min-h-screen px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="domus-card space-y-3 px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Reports
              </p>
              <h1 className="mt-1 text-[22px] font-[640] tracking-[-0.02em] text-[var(--ink)]">
                Financial reports
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Portfolio reporting for rent, receivables, ledgers, P&amp;L, and tax prep.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={`/api/pdf/receipts?year=${reportYear}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-shadow hover:bg-[var(--accent-strong)] hover:shadow-md sm:min-h-0"
                title={`Download all ${reportYear} rent receipts as a PDF export.`}
              >
                <Download className="h-4 w-4" />
                Export Receipts
              </Link>
              <Link
                href={getRoleHomePath(role)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm transition-shadow hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)] sm:min-h-0"
                title="Return to your workspace."
              >
                Back to Workspace
              </Link>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Year
                </span>
                <div className="mobile-scroll-x flex gap-2 pb-1 sm:flex-wrap sm:pb-0">
                  {yearOptions.map((year) => (
                    <Link
                      key={year}
                      href={`${reportsBasePath}?year=${year}`}
                      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold sm:min-h-0 ${
                        year === reportYear
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-2)] shadow-sm transition-shadow hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)] hover:shadow-md"
                      }`}
                      title={`View ${year} reports.`}
                    >
                      {year}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        <DrilldownPanel
          openBalanceCents={openBalanceCents}
          netIncomeCents={netIncomeCents}
          tenantCount={tenantCount}
          receivableCharges={receivableCharges}
          paidCharges={paidCharges}
          expenseItems={expenseItems}
          tenantBalances={tenantBalances}
          reportYear={reportYear}
          onEditCharge={editCharge}
          onDeleteCharge={deleteCharge}
          onWaiveCharge={waiveCharge}
          onUpdateExpense={role === "owner" ? updateExpense : undefined}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ReportCard id="rent-roll" icon="bar-chart-3" title="Rent Roll" description="Current tenant roster with rent amounts and balances." />
          <ReportCard id="delinquency-aging" icon="receipt" title="Overdue Rent Aging" description="Outstanding balances by 30/60/90+ day aging." />
          <ReportCard id="tenant-ledger" icon="file-bar-chart-2" title="Tenant Ledger" description="Complete charge and payment history per tenant." />
          <ReportCard id="monthly-pnl" icon="wallet" title="Monthly P&L" description="Revenue versus expenses by property by month." />
          <ReportCard id="tax-summary" icon="landmark" title="Tax Summary" description="Annual rental income and deductions in a Schedule E style format." />
          <ReportCard id="accounts-receivable" icon="credit-card" title="Accounts Receivable" description="All outstanding balances grouped by tenant." />
        </section>

        <div className="space-y-6">
          <RentRollReport data={rentRoll} onEditCharge={editCharge} onDeleteCharge={deleteCharge} onWaiveCharge={waiveCharge} />
          <DelinquencyReport data={delinquency} onEditCharge={editCharge} onDeleteCharge={deleteCharge} onWaiveCharge={waiveCharge} />
          <TenantLedgerReport data={tenantLedger} onEditCharge={editCharge} onDeleteCharge={deleteCharge} onWaiveCharge={waiveCharge} />
          <MonthlyPnLReport data={monthlyPnl} onEditCharge={editCharge} onUpdateExpense={role === "owner" ? updateExpense : undefined} />
          <TaxSummaryReport data={taxSummary} />
          <ReceivablesReport data={receivables} onEditCharge={editCharge} onDeleteCharge={deleteCharge} onWaiveCharge={waiveCharge} />
        </div>
      </div>
    </main>
  );
}
