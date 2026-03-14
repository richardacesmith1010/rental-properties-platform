"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction } from "@/app/actions";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { VendorDTO } from "@/lib/vendors";
import type { PropertyFileDTO } from "@/lib/documents";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedList } from "@/components/ui/animated-list";
import { expenseCategories, formatCategory } from "./expense-form";

const recurringFrequencies = ["monthly", "quarterly", "annually"];

export function ExpenseList({
  data,
  vendors,
  propertyFiles,
  onUpdateExpense,
  onDeleteExpense
}: {
  data: ExpenseDashboardData;
  vendors: VendorDTO[];
  propertyFiles: PropertyFileDTO[];
  onUpdateExpense: StatefulAction;
  onDeleteExpense: StatefulAction;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(data.properties[0]?.id ?? "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const availableVendors = useMemo(() => [...vendors].sort((left, right) => left.name.localeCompare(right.name)), [vendors]);
  const availableReceiptFiles = useMemo(() => propertyFiles.filter((file) => !selectedPropertyId || file.propertyId === selectedPropertyId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [propertyFiles, selectedPropertyId]);

  const filteredExpenses = useMemo(
    () => data.expenses.filter((expense) => {
      if (selectedPropertyId && expense.propertyId !== selectedPropertyId) return false;
      if (categoryFilter !== "all" && expense.category !== categoryFilter) return false;
      if (dateFrom && expense.expenseDate < dateFrom) return false;
      if (dateTo && expense.expenseDate > dateTo) return false;
      return true;
    }),
    [categoryFilter, data.expenses, dateFrom, dateTo, selectedPropertyId]
  );

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>
          <option value="">All properties</option>
          {data.properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {expenseCategories.map((category) => <option key={category} value={category}>{formatCategory(category)}</option>)}
        </Select>
        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>
      {filteredExpenses.length === 0 ? (
        <EmptyState message="No expenses match the selected filters." />
      ) : (
        <AnimatedList>
          {filteredExpenses.map((expense, index) => (
            <ExpenseRow key={expense.id} expense={expense} vendors={availableVendors} receiptFiles={availableReceiptFiles} onUpdateExpense={onUpdateExpense} onDeleteExpense={onDeleteExpense} last={index === filteredExpenses.length - 1} />
          ))}
        </AnimatedList>
      )}
    </div>
  );
}

function ExpenseRow({ expense, vendors, receiptFiles, onUpdateExpense, onDeleteExpense, last }: { expense: ExpenseDashboardData["expenses"][number]; vendors: VendorDTO[]; receiptFiles: PropertyFileDTO[]; onUpdateExpense: StatefulAction; onDeleteExpense: StatefulAction; last: boolean; }) {
  const [updateState, updateAction] = useFormState(onUpdateExpense, null);
  const [deleteState, deleteAction] = useFormState(onDeleteExpense, null);
  const [isManaging, setIsManaging] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (updateState?.success || deleteState?.success) {
      setIsManaging(false);
    }
  }, [deleteState, updateState]);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{expense.propertyName} • {formatCategory(expense.category)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{formatDate(expense.expenseDate)}{expense.vendorName ? ` • ${expense.vendorName}` : ""}{expense.recurring ? ` • Recurs ${expense.recurringFrequency ?? "monthly"}` : ""}</p>
        {expense.description ? <p className="mt-0.5 text-xs text-zinc-500">{expense.description}</p> : null}
        {isManaging ? (
          <>
            <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="expenseId" value={expense.id} />
              <Select name="category" defaultValue={expense.category}>{expenseCategories.map((category) => <option key={category} value={category}>{formatCategory(category)}</option>)}</Select>
              <Input name="amountDollars" type="number" min={0.01} step="0.01" defaultValue={expense.amountCents / 100} required />
              <Input name="expenseDate" type="date" defaultValue={expense.expenseDate} required />
              <Textarea name="description" rows={2} defaultValue={expense.description ?? ""} placeholder="Description" className="sm:col-span-3" />
              <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" name="recurring" value="true" defaultChecked={expense.recurring} />Recurring</label>
              <Select name="recurringFrequency" defaultValue={expense.recurringFrequency ?? ""}><option value="">Not recurring</option>{recurringFrequencies.map((frequency) => <option key={frequency} value={frequency}>{formatCategory(frequency)}</option>)}</Select>
              <Select name="vendorId" defaultValue={expense.vendorId ?? ""}><option value="">No vendor linked</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select>
              <Select name="receiptFileId" defaultValue={expense.receiptFileId ?? ""}><option value="">No receipt file</option>{receiptFiles.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}</Select>
              <Input name="receiptFile" type="file" className="sm:col-span-2" />
              <div className="sm:col-span-3 flex items-center gap-2"><SubmitButton size="sm" variant="outline" title="Save updates to this expense.">Save Expense</SubmitButton><Badge variant="outline">{formatCurrency(expense.amountCents)}</Badge></div>
              {updateState && !updateState.success ? <p className="sm:col-span-3 text-xs text-red-500">{updateState.error}</p> : null}
              {updateState && updateState.success ? <p className="sm:col-span-3 text-xs text-emerald-600">Expense updated.</p> : null}
            </form>
            <form action={deleteAction} className="mt-2" ref={deleteFormRef}>
              <input type="hidden" name="expenseId" value={expense.id} />
              <SubmitButton size="sm" variant="destructive" onClick={(event) => { event.preventDefault(); setConfirmDeleteOpen(true); }} title="Delete this expense record permanently.">Delete</SubmitButton>
              {deleteState && !deleteState.success ? <p className="mt-1 text-xs text-red-500">{deleteState.error}</p> : null}
              {deleteState && deleteState.success ? <p className="mt-1 text-xs text-emerald-600">Expense deleted.</p> : null}
            </form>
          </>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Button type="button" size="sm" variant={isManaging ? "default" : "outline"} onClick={() => setIsManaging((current) => !current)} title={isManaging ? "Hide expense edit controls." : "Open expense edit controls."}>{isManaging ? "Done" : "Manage"}</Button>
      </div>
      <ConfirmDialog title="Delete Expense?" description="Are you sure? This will permanently delete this expense record." confirmLabel="Delete Expense" open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} onConfirm={() => deleteFormRef.current?.requestSubmit()} />
    </DataRow>
  );
}
