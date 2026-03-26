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
    <main id="main-content" className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Financial Reports</h1>
              <p className="text-sm text-zinc-600">
                Portfolio reporting for rent, receivables, ledgers, P&amp;L, and tax prep.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/api/pdf/receipts?year=${reportYear}`}
                className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-shadow hover:bg-violet-500 hover:shadow-md"
                title={`Download all ${reportYear} rent receipts as a PDF export.`}
              >
                <Download className="h-4 w-4" />
                Export Receipts
              </Link>
              <Link
                href={getRoleHomePath(role)}
                className="rounded-md border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition-shadow hover:bg-zinc-50 hover:shadow-md"
                title="Return to your workspace."
              >
                Back to Workspace
              </Link>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Year</span>
                <div className="flex flex-wrap gap-2">
                  {yearOptions.map((year) => (
                    <Link
                      key={year}
                      href={`${reportsBasePath}?year=${year}`}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                        year === reportYear
                          ? "bg-violet-600 text-white"
                          : "border border-zinc-200/80 bg-white text-zinc-700 shadow-sm transition-shadow hover:bg-zinc-50 hover:shadow-md"
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
