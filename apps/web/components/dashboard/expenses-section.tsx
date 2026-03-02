"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { VendorDTO } from "@/lib/vendors";
import type { PropertyFileDTO } from "@/lib/documents";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface ExpensesSectionProps {
  data: ExpenseDashboardData;
  vendors: VendorDTO[];
  propertyFiles: PropertyFileDTO[];
  onCreateExpense: StatefulAction;
  onUpdateExpense: StatefulAction;
  onDeleteExpense: StatefulAction;
}

const expenseCategories = [
  "mortgage",
  "insurance",
  "property_tax",
  "hoa",
  "repair",
  "maintenance",
  "utility",
  "management_fee",
  "legal",
  "other"
];

const recurringFrequencies = ["monthly", "quarterly", "annually"];

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
  );
}

export function ExpensesSection({
  data,
  vendors,
  propertyFiles,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense
}: ExpensesSectionProps) {
  const [createState, createAction] = useFormState(onCreateExpense, null);
  const [showCreateExpenseForm, setShowCreateExpenseForm] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState(data.properties[0]?.id ?? "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const selectedSummary = useMemo(
    () => data.pnlByProperty.find((row) => row.propertyId === selectedPropertyId) ?? null,
    [data.pnlByProperty, selectedPropertyId]
  );

  const filteredExpenses = useMemo(() => {
    return data.expenses.filter((expense) => {
      if (selectedPropertyId && expense.propertyId !== selectedPropertyId) {
        return false;
      }
      if (categoryFilter !== "all" && expense.category !== categoryFilter) {
        return false;
      }
      if (dateFrom && expense.expenseDate < dateFrom) {
        return false;
      }
      if (dateTo && expense.expenseDate > dateTo) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, data.expenses, dateFrom, dateTo, selectedPropertyId]);

  const availableVendors = useMemo(
    () => [...vendors].sort((left, right) => left.name.localeCompare(right.name)),
    [vendors]
  );

  const availableReceiptFiles = useMemo(
    () =>
      propertyFiles
        .filter((file) => !selectedPropertyId || file.propertyId === selectedPropertyId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [propertyFiles, selectedPropertyId]
  );

  useEffect(() => {
    if (createState?.success) {
      setShowCreateExpenseForm(false);
    }
  }, [createState]);

  if (!data.enabled) {
    return (
      <div id="expenses">
        <FeatureWarning
          title="Expenses Unavailable"
          message={
            data.warning ??
            "Expense tracking is not ready yet. Apply the Phase 4 migration and reload."
          }
        />
      </div>
    );
  }

  return (
    <div id="expenses" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Create Expense</CardTitle>
              <Button
                type="button"
                size="sm"
                variant={showCreateExpenseForm ? "default" : "outline"}
                onClick={() => setShowCreateExpenseForm((current) => !current)}
                title={showCreateExpenseForm ? "Hide expense creation form." : "Open expense creation form."}
              >
                {showCreateExpenseForm ? "Done" : "Add Expense"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showCreateExpenseForm ? (
              <form className="space-y-3" action={createAction}>
                <FormError state={createState} />
                <FormSuccess state={createState} message="Expense created." />
                <Select
                  name="propertyId"
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                  required
                >
                  <option value="">Select property</option>
                  {data.properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                <Select name="category" defaultValue="maintenance" required>
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {formatCategory(category)}
                    </option>
                  ))}
                </Select>
                <Input
                  name="amountDollars"
                  type="number"
                  min={0.01}
                  step="0.01"
                  placeholder="Amount (USD)"
                  required
                />
                <Input name="expenseDate" type="date" required />
                <Textarea
                  name="description"
                  rows={2}
                  placeholder="Description (optional)"
                />
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" name="recurring" value="true" />
                  Recurring expense
                </label>
                <Select name="recurringFrequency" defaultValue="">
                  <option value="">Not recurring</option>
                  {recurringFrequencies.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {formatCategory(frequency)}
                    </option>
                  ))}
                </Select>
                <Select name="vendorId" defaultValue="">
                  <option value="">No vendor linked</option>
                  {availableVendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </Select>
                <Select name="receiptFileId" defaultValue="">
                  <option value="">No existing receipt file</option>
                  {availableReceiptFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.fileName}
                    </option>
                  ))}
                </Select>
                <Input name="receiptFile" type="file" />
                <SubmitButton className="w-full" title="Create this expense record.">
                  Save Expense
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-zinc-500">
                Expense creation form hidden. Click Add Expense to create a new record.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property P&amp;L</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSummary ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Income</p>
                    <p className="text-lg font-semibold text-emerald-700">{dollars(selectedSummary.incomeCents)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Expenses</p>
                    <p className="text-lg font-semibold text-rose-700">{dollars(selectedSummary.expenseCents)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Net Cashflow</p>
                    <p className="text-lg font-semibold text-indigo-700">{dollars(selectedSummary.netCents)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Last 12 Months
                  </p>
                  <div className="space-y-1">
                    {(data.monthlyByProperty[selectedPropertyId] ?? []).map((row) => (
                      <div key={row.month} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-xs">
                        <span className="font-medium text-zinc-700">{row.month}</span>
                        <span className="text-zinc-500">Income {dollars(row.incomeCents)}</span>
                        <span className="text-zinc-500">Expense {dollars(row.expenseCents)}</span>
                        <span className="font-semibold text-zinc-900">Net {dollars(row.netCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Expense Categories
                  </p>
                  {(data.categoryByProperty[selectedPropertyId] ?? []).length === 0 ? (
                    <EmptyState message="No expenses recorded for this property yet." />
                  ) : (
                    <div className="space-y-1">
                      {(data.categoryByProperty[selectedPropertyId] ?? []).map((row) => (
                        <div key={row.category} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-xs">
                          <span>{formatCategory(row.category)}</span>
                          <span className="font-semibold">{dollars(row.totalCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState message="Add a property to start tracking P&L." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {expenseCategories.map((category) => (
                <option key={category} value={category}>
                  {formatCategory(category)}
                </option>
              ))}
            </Select>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>

          {filteredExpenses.length === 0 ? (
            <EmptyState message="No expenses match the selected filters." />
          ) : (
            <div>
              {filteredExpenses.map((expense, i) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  vendors={availableVendors}
                  receiptFiles={availableReceiptFiles}
                  onUpdateExpense={onUpdateExpense}
                  onDeleteExpense={onDeleteExpense}
                  last={i === filteredExpenses.length - 1}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExpenseRow({
  expense,
  vendors,
  receiptFiles,
  onUpdateExpense,
  onDeleteExpense,
  last
}: {
  expense: ExpenseDashboardData["expenses"][number];
  vendors: VendorDTO[];
  receiptFiles: PropertyFileDTO[];
  onUpdateExpense: StatefulAction;
  onDeleteExpense: StatefulAction;
  last: boolean;
}) {
  const [updateState, updateAction] = useFormState(onUpdateExpense, null);
  const [deleteState, deleteAction] = useFormState(onDeleteExpense, null);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    if (updateState?.success || deleteState?.success) {
      setIsManaging(false);
    }
  }, [deleteState, updateState]);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          {expense.propertyName} • {formatCategory(expense.category)}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {expense.expenseDate}
          {expense.vendorName ? ` • ${expense.vendorName}` : ""}
          {expense.recurring ? ` • Recurs ${expense.recurringFrequency ?? "monthly"}` : ""}
        </p>
        {expense.description && (
          <p className="mt-0.5 text-xs text-zinc-500">{expense.description}</p>
        )}

        {isManaging && (
          <>
            <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="expenseId" value={expense.id} />
              <Select name="category" defaultValue={expense.category}>
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {formatCategory(category)}
                  </option>
                ))}
              </Select>
              <Input
                name="amountDollars"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={expense.amountCents / 100}
                required
              />
              <Input name="expenseDate" type="date" defaultValue={expense.expenseDate} required />
              <Textarea
                name="description"
                rows={2}
                defaultValue={expense.description ?? ""}
                placeholder="Description"
                className="sm:col-span-3"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" name="recurring" value="true" defaultChecked={expense.recurring} />
                Recurring
              </label>
              <Select name="recurringFrequency" defaultValue={expense.recurringFrequency ?? ""}>
                <option value="">Not recurring</option>
                {recurringFrequencies.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {formatCategory(frequency)}
                  </option>
                ))}
              </Select>
              <Select name="vendorId" defaultValue={expense.vendorId ?? ""}>
                <option value="">No vendor linked</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
              <Select name="receiptFileId" defaultValue={expense.receiptFileId ?? ""}>
                <option value="">No receipt file</option>
                {receiptFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.fileName}
                  </option>
                ))}
              </Select>
              <Input name="receiptFile" type="file" className="sm:col-span-2" />
              <div className="sm:col-span-3 flex items-center gap-2">
                <SubmitButton size="sm" variant="outline" title="Save updates to this expense.">
                  Save Expense
                </SubmitButton>
                <Badge variant="outline">{dollars(expense.amountCents)}</Badge>
              </div>
              {updateState && !updateState.success && (
                <p className="sm:col-span-3 text-xs text-red-500">{updateState.error}</p>
              )}
            </form>

            <form
              action={deleteAction}
              className="mt-2"
              onSubmit={(event) => {
                if (!window.confirm("Delete this expense record?")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="expenseId" value={expense.id} />
              <Button type="submit" size="sm" variant="destructive" title="Delete this expense record permanently.">
                Delete
              </Button>
              {deleteState && !deleteState.success && (
                <p className="mt-1 text-xs text-red-500">{deleteState.error}</p>
              )}
            </form>
          </>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={isManaging ? "default" : "outline"}
          onClick={() => setIsManaging((current) => !current)}
          title={isManaging ? "Hide expense edit controls." : "Open expense edit controls."}
        >
          {isManaging ? "Done" : "Manage"}
        </Button>
      </div>
    </DataRow>
  );
}
