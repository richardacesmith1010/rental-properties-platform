"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { ChargeEditModal } from "@/components/dashboard/charge-edit-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { type ChargeDetailRecordDTO, type ExpenseLineItemDTO, chargeCategoryLabel } from "@/lib/charge-audit";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TenantBalanceItem {
  tenantName: string;
  tenantEmail: string;
  currentBalanceCents: number;
  chargeCount: number;
}

interface DrilldownPanelProps {
  openBalanceCents: number;
  netIncomeCents: number;
  tenantCount: number;
  receivableCharges: ChargeDetailRecordDTO[];
  paidCharges: ChargeDetailRecordDTO[];
  expenseItems: ExpenseLineItemDTO[];
  tenantBalances: TenantBalanceItem[];
  reportYear: number;
  onEditCharge?: StatefulAction;
  onDeleteCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onUpdateExpense?: StatefulAction;
}

type DrilldownView = "receivables" | "net-income" | "ledger";

function ChargeActionList({
  charges,
  onEditCharge,
  onDeleteCharge,
  onWaiveCharge
}: {
  charges: ChargeDetailRecordDTO[];
  onEditCharge?: StatefulAction;
  onDeleteCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
}) {
  const router = useRouter();
  const [activeCharge, setActiveCharge] = useState<ChargeDetailRecordDTO | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = (charge: ChargeDetailRecordDTO) => {
    if (!onDeleteCharge) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("chargeId", charge.id);
      formData.set("reason", "Deleted from financial reports");
      const result = await onDeleteCharge(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to delete this charge.");
        return;
      }
      toast.success(result.message ?? "Charge deleted.");
      router.refresh();
    });
  };

  const handleWaive = (charge: ChargeDetailRecordDTO) => {
    if (!onWaiveCharge) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("chargeId", charge.id);
      formData.set("reason", "Waived from financial reports");
      const result = await onWaiveCharge(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to waive this charge.");
        return;
      }
      toast.success(result.message ?? "Charge waived.");
      router.refresh();
    });
  };

  if (charges.length === 0) {
    return (
      <EmptyState
        title="No source charges"
        description="There are no matching charges behind this report slice."
      />
    );
  }

  return (
    <div className="space-y-3">
      {charges.map((charge) => (
        <div key={charge.id} className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{charge.tenantName}</p>
                <span
                  className={statusBadgeClasses(charge.status)}
                  aria-label={statusAriaLabel(charge.status, "Charge status")}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(charge.status).dot}`}
                  />
                  {charge.status}
                </span>
                <Badge variant="outline">{chargeCategoryLabel(charge.category)}</Badge>
                {charge.editedCount > 0 ? (
                  <Badge
                    variant="outline"
                    title={
                      charge.latestEditedAt && charge.latestEditedByName
                        ? `Last edited by ${charge.latestEditedByName} on ${formatDate(charge.latestEditedAt)}`
                        : "Charge has been edited."
                    }
                  >
                    Edited
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {charge.propertyName} • Unit {charge.unitNumber}
              </p>
              <p className="text-sm text-muted-foreground">
                Due {formatDate(charge.dueDate)}
                {charge.notes ? ` • ${charge.notes}` : ""}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="text-base font-semibold text-foreground">
                {formatCurrency(charge.amountCents)}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                {onEditCharge && charge.status !== "paid" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveCharge(charge)}
                    title="Edit this charge."
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                ) : null}
                {onDeleteCharge && charge.status !== "paid" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleDelete(charge)}
                    title="Soft-delete this charge."
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
                {onWaiveCharge && charge.status !== "paid" && charge.status !== "waived" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleWaive(charge)}
                    title="Waive this charge."
                  >
                    Waive
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ))}

      {onEditCharge ? (
        <ChargeEditModal
          charge={activeCharge}
          open={Boolean(activeCharge)}
          onClose={() => setActiveCharge(null)}
          onSave={onEditCharge}
        />
      ) : null}
    </div>
  );
}

function ExpenseActionList({
  expenses,
  onUpdateExpense
}: {
  expenses: ExpenseLineItemDTO[];
  onUpdateExpense?: StatefulAction;
}) {
  const router = useRouter();
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (expenses.length === 0) {
    return (
      <EmptyState
        title="No expense records"
        description="Expenses will appear here once they are recorded."
      />
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => {
        const isEditing = editingExpenseId === expense.id;
        return (
          <div key={expense.id} className="rounded-xl border border-border/60 bg-background px-4 py-3">
            {isEditing && onUpdateExpense ? (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  formData.set("expenseId", expense.id);
                  formData.set("recurring", "false");
                  formData.set("recurringFrequency", "");
                  formData.set("vendorId", "");
                  formData.set("receiptFileId", "");
                  startTransition(async () => {
                    const result = await onUpdateExpense(null, formData);
                    if (!result?.success) {
                      toast.error(result?.error ?? "Unable to update this expense.");
                      return;
                    }
                    toast.success(result.message ?? "Expense updated.");
                    setEditingExpenseId(null);
                    router.refresh();
                  });
                }}
              >
                <input name="amountDollars" type="number" min={0.01} step="0.01" defaultValue={(expense.amountCents / 100).toFixed(2)} className="domus-input h-10 rounded-md px-3 text-sm" />
                <input name="expenseDate" type="date" defaultValue={expense.expenseDate} className="domus-input h-10 rounded-md px-3 text-sm" />
                <input name="description" defaultValue={expense.description ?? ""} className="domus-input h-10 rounded-md px-3 text-sm sm:col-span-2" />
                <select name="category" defaultValue={expense.category} className="domus-input h-10 rounded-md px-3 text-sm">
                  <option value="mortgage">Mortgage</option>
                  <option value="insurance">Insurance</option>
                  <option value="property_tax">Property Tax</option>
                  <option value="hoa">HOA</option>
                  <option value="repair">Repair</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="utility">Utility</option>
                  <option value="management_fee">Management Fee</option>
                  <option value="legal">Legal</option>
                  <option value="other">Other</option>
                </select>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setEditingExpenseId(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    Save Expense
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{expense.description || "Expense record"}</p>
                  <p className="text-sm text-muted-foreground">
                    {expense.propertyName} • {expense.category}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(expense.expenseDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{formatCurrency(expense.amountCents)}</span>
                  {onUpdateExpense ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingExpenseId(expense.id)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DrilldownPanel({
  openBalanceCents,
  netIncomeCents,
  tenantCount,
  receivableCharges,
  paidCharges,
  expenseItems,
  tenantBalances,
  reportYear,
  onEditCharge,
  onDeleteCharge,
  onWaiveCharge,
  onUpdateExpense
}: DrilldownPanelProps) {
  const [activeView, setActiveView] = useState<DrilldownView>("receivables");
  const balanceRows = useMemo(
    () => tenantBalances.filter((tenant) => tenant.currentBalanceCents > 0),
    [tenantBalances]
  );

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveView("receivables")}
          className={`domus-kpi-pill text-left transition ${activeView === "receivables" ? "ring-2 ring-primary/40" : ""}`}
          title="Show every unpaid charge behind open receivables."
        >
          <p className="text-xs uppercase tracking-[0.16em] domus-muted">Open receivables</p>
          <span className="mt-2 block text-2xl font-bold domus-heading">{formatCurrency(openBalanceCents)}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView("net-income")}
          className={`domus-kpi-pill text-left transition ${activeView === "net-income" ? "ring-2 ring-primary/40" : ""}`}
          title={`Show the ${reportYear} net income breakdown.`}
        >
          <p className="text-xs uppercase tracking-[0.16em] domus-muted">Net income ({reportYear})</p>
          <span className="mt-2 block text-2xl font-bold domus-heading">{formatCurrency(netIncomeCents)}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView("ledger")}
          className={`domus-kpi-pill text-left transition ${activeView === "ledger" ? "ring-2 ring-primary/40" : ""}`}
          title="Show tenants with ledger balances."
        >
          <p className="text-xs uppercase tracking-[0.16em] domus-muted">Tenants in ledger</p>
          <span className="mt-2 block text-2xl font-bold domus-heading">{tenantCount}</span>
        </button>
      </section>

      <Card className="border border-border/60 p-5">
        {activeView === "receivables" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Open Receivables</h2>
              <p className="text-sm text-muted-foreground">
                Every pending or late charge contributing to outstanding balances.
              </p>
            </div>
            <ChargeActionList
              charges={receivableCharges}
              onEditCharge={onEditCharge}
              onDeleteCharge={onDeleteCharge}
              onWaiveCharge={onWaiveCharge}
            />
          </div>
        ) : null}

        {activeView === "net-income" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Income Line Items</h2>
                <p className="text-sm text-muted-foreground">Paid charges included in net income.</p>
              </div>
              <ChargeActionList charges={paidCharges} onEditCharge={onEditCharge} />
            </div>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Expense Line Items</h2>
                <p className="text-sm text-muted-foreground">Expenses reducing net income.</p>
              </div>
              <ExpenseActionList expenses={expenseItems} onUpdateExpense={onUpdateExpense} />
            </div>
          </div>
        ) : null}

        {activeView === "ledger" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Tenant Balances</h2>
              <p className="text-sm text-muted-foreground">
                Current tenant balances derived from the tenant ledger.
              </p>
            </div>
            {balanceRows.length === 0 ? (
              <EmptyState
                title="No tenant balances"
                description="Tenant balances will appear here once charges or payments are recorded."
              />
            ) : (
              <div className="space-y-3">
                {balanceRows.map((tenant) => (
                  <div key={`${tenant.tenantEmail}:${tenant.chargeCount}`} className="rounded-xl border border-border/60 bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{tenant.tenantName}</p>
                        <p className="text-sm text-muted-foreground">{tenant.tenantEmail}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {formatCurrency(tenant.currentBalanceCents)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tenant.chargeCount} open charge{tenant.chargeCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export { ChargeActionList, ExpenseActionList };
