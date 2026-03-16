"use client";

import type { StatefulAction } from "@/app/actions";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { VendorDTO } from "@/lib/vendors";
import type { PropertyFileDTO } from "@/lib/documents";
import { formatCurrency } from "@/lib/format";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { ExpenseForm } from "./expenses/expense-form";
import { ExpenseList } from "./expenses/expense-list";

interface ExpensesSectionProps {
  data: ExpenseDashboardData;
  vendors: VendorDTO[];
  propertyFiles: PropertyFileDTO[];
  onCreateExpense: StatefulAction;
  onUpdateExpense: StatefulAction;
  onDeleteExpense: StatefulAction;
}

export function ExpensesSection({ data, vendors, propertyFiles, onCreateExpense, onUpdateExpense, onDeleteExpense }: ExpensesSectionProps) {
  const selectedPropertyId = data.properties[0]?.id ?? "";
  const selectedSummary = data.pnlByProperty.find((row) => row.propertyId === selectedPropertyId) ?? null;

  if (!data.enabled) {
    return (
      <div id="expenses">
        <FeatureWarning title="Expenses Unavailable" message={data.warning ?? "Expense tracking is not ready yet. Apply the Phase 4 migration and reload."} />
      </div>
    );
  }

  return (
    <div id="expenses" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpenseForm data={data} vendors={vendors} propertyFiles={propertyFiles} onCreateExpense={onCreateExpense} />
        <Card className="border border-border/50 shadow-sm">
          <CardHeader><CardTitle className="text-xl font-semibold">Property P&amp;L</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedSummary ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/50 bg-zinc-50 px-3 py-2 shadow-sm"><p className="text-[11px] uppercase tracking-wide text-zinc-500">Income</p><p className="text-lg font-semibold text-emerald-700">{formatCurrency(selectedSummary.incomeCents)}</p></div>
                  <div className="rounded-xl border border-border/50 bg-zinc-50 px-3 py-2 shadow-sm"><p className="text-[11px] uppercase tracking-wide text-zinc-500">Expenses</p><p className="text-lg font-semibold text-rose-700">{formatCurrency(selectedSummary.expenseCents)}</p></div>
                  <div className="rounded-xl border border-border/50 bg-zinc-50 px-3 py-2 shadow-sm"><p className="text-[11px] uppercase tracking-wide text-zinc-500">Net Cashflow</p><p className="text-lg font-semibold text-violet-700">{formatCurrency(selectedSummary.netCents)}</p></div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Last 12 Months</p>
                  <div className="space-y-1">
                    {(data.monthlyByProperty[selectedPropertyId] ?? []).map((row) => (
                      <div key={row.month} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2 text-xs shadow-sm">
                        <span className="font-medium text-zinc-700">{row.month}</span>
                        <span className="text-zinc-500">Income {formatCurrency(row.incomeCents)}</span>
                        <span className="text-zinc-500">Expense {formatCurrency(row.expenseCents)}</span>
                        <span className="font-semibold text-zinc-900">Net {formatCurrency(row.netCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Expense Categories</p>
                  {(data.categoryByProperty[selectedPropertyId] ?? []).length === 0 ? (
                    <EmptyState message="No expenses yet for this property. Add one to start category tracking." />
                  ) : (
                    <div className="space-y-1">
                      {(data.categoryByProperty[selectedPropertyId] ?? []).map((row) => (
                        <div key={row.category} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2 text-xs shadow-sm">
                          <span>{row.category.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")}</span>
                          <span className="font-semibold">{formatCurrency(row.totalCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No expenses recorded"
                description="Track property expenses for tax reporting and P&L."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="border border-border/50 shadow-sm">
        <CardHeader><CardTitle className="text-xl font-semibold">Expense Ledger</CardTitle></CardHeader>
        <CardContent>
          <ExpenseList data={data} vendors={vendors} propertyFiles={propertyFiles} onUpdateExpense={onUpdateExpense} onDeleteExpense={onDeleteExpense} />
        </CardContent>
      </Card>
    </div>
  );
}
