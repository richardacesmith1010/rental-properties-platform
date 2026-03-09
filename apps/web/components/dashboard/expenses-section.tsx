"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { formatCurrency, formatDate } from "@/lib/format";

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
const CREATE_EXPENSE_STEPS = [
  "Property",
  "Category",
  "Amount",
  "Date",
  "Recurring",
  "Vendor",
  "Receipt",
  "Description",
  "Review & Save"
] as const;

interface ExpenseDraft {
  propertyId: string;
  category: string;
  amountDollars: string;
  expenseDate: string;
  recurring: boolean;
  recurringFrequency: string;
  vendorId: string;
  receiptFileId: string;
  description: string;
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

function StepPill({
  label,
  active,
  done,
  skipped
}: {
  label: string;
  active: boolean;
  done: boolean;
  skipped: boolean;
}) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  canAdvance: boolean,
  advance: () => void
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
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
  const [createStep, setCreateStep] = useState(0);
  const [skippedCreateSteps, setSkippedCreateSteps] = useState<number[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(data.properties[0]?.id ?? "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    propertyId: data.properties[0]?.id ?? "",
    category: "maintenance",
    amountDollars: "",
    expenseDate: "",
    recurring: false,
    recurringFrequency: "",
    vendorId: "",
    receiptFileId: "",
    description: ""
  });

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

  const availableCreateReceiptFiles = useMemo(
    () =>
      propertyFiles
        .filter((file) => !expenseDraft.propertyId || file.propertyId === expenseDraft.propertyId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [expenseDraft.propertyId, propertyFiles]
  );

  const createRequiredComplete = Boolean(
    expenseDraft.propertyId &&
      expenseDraft.category &&
      Number(expenseDraft.amountDollars) > 0 &&
      expenseDraft.expenseDate &&
      (!expenseDraft.recurring || expenseDraft.recurringFrequency)
  );

  const createStepComplete = (step: number) => {
    if (step === 0) return Boolean(expenseDraft.propertyId);
    if (step === 1) return Boolean(expenseDraft.category);
    if (step === 2) return Number(expenseDraft.amountDollars) > 0;
    if (step === 3) return Boolean(expenseDraft.expenseDate);
    if (step === 4) return !expenseDraft.recurring || Boolean(expenseDraft.recurringFrequency);
    if (step === 5 || step === 6 || step === 7) return true;
    return createRequiredComplete;
  };

  const markCreateStepSkipped = (step: number) => {
    setSkippedCreateSteps((previous) =>
      previous.includes(step) ? previous : [...previous, step]
    );
  };

  const canSkipCreateStep = (step: number) => step >= 5 && step <= 7;

  useEffect(() => {
    if (createState?.success) {
      setCreateStep(0);
      setSkippedCreateSteps([]);
      setExpenseDraft({
        propertyId: data.properties[0]?.id ?? "",
        category: "maintenance",
        amountDollars: "",
        expenseDate: "",
        recurring: false,
        recurringFrequency: "",
        vendorId: "",
        receiptFileId: "",
        description: ""
      });
    }
  }, [createState, data.properties]);

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
            <CardTitle>Create Expense</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-600">
              One field at a time. Press Enter or Next to continue. Optional steps can be skipped.
            </p>
            <FormError state={createState} />
            <FormSuccess state={createState} message="Expense created." />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
              {CREATE_EXPENSE_STEPS.map((label, index) => (
                <StepPill
                  key={label}
                  label={label}
                  active={createStep === index}
                  done={createStepComplete(index)}
                  skipped={skippedCreateSteps.includes(index)}
                />
              ))}
            </div>

            {createStep === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 1: Select the property this expense belongs to.</p>
                <Select
                  value={expenseDraft.propertyId}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      propertyId: event.target.value,
                      receiptFileId: ""
                    }))
                  }
                >
                  <option value="">Select property</option>
                  {data.properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {createStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 2: Choose the expense category.</p>
                <Select
                  value={expenseDraft.category}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {formatCategory(category)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {createStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 3: Enter amount in US dollars.</p>
                <Input
                  value={expenseDraft.amountDollars}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, amountDollars: event.target.value }))
                  }
                  onKeyDown={(event) =>
                    onEnterNext(event, createStepComplete(createStep), () => setCreateStep(3))
                  }
                  type="number"
                  min={0.01}
                  step="0.01"
                  placeholder="Amount (USD)"
                  required
                />
              </div>
            )}

            {createStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 4: Select the date of the expense.</p>
                <Input
                  value={expenseDraft.expenseDate}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, expenseDate: event.target.value }))
                  }
                  type="date"
                  required
                />
              </div>
            )}

            {createStep === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">
                  Step 5: Set recurring behavior. Frequency is required only if recurring is on.
                </p>
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={expenseDraft.recurring}
                    onChange={(event) =>
                      setExpenseDraft((current) => ({
                        ...current,
                        recurring: event.target.checked,
                        recurringFrequency: event.target.checked ? current.recurringFrequency : ""
                      }))
                    }
                  />
                  Recurring expense
                </label>
                <Select
                  value={expenseDraft.recurringFrequency}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      recurringFrequency: event.target.value
                    }))
                  }
                  disabled={!expenseDraft.recurring}
                >
                  <option value="">Not recurring</option>
                  {recurringFrequencies.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {formatCategory(frequency)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {createStep === 5 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 6: Link a vendor (optional).</p>
                <Select
                  value={expenseDraft.vendorId}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, vendorId: event.target.value }))
                  }
                >
                  <option value="">No vendor linked</option>
                  {availableVendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {createStep === 6 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">
                  Step 7: Link an existing receipt file (optional).
                </p>
                <Select
                  value={expenseDraft.receiptFileId}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({
                      ...current,
                      receiptFileId: event.target.value
                    }))
                  }
                >
                  <option value="">No existing receipt file</option>
                  {availableCreateReceiptFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.fileName}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {createStep === 7 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Step 8: Add description (optional).</p>
                <Textarea
                  value={expenseDraft.description}
                  onChange={(event) =>
                    setExpenseDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={2}
                  placeholder="Description (optional)"
                />
              </div>
            )}

            {createStep === 8 && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Final step: review details and save.</p>
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                  <p>
                    <span className="font-semibold">Property:</span>{" "}
                    {data.properties.find((property) => property.id === expenseDraft.propertyId)?.name ??
                      "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold">Category:</span>{" "}
                    {expenseDraft.category ? formatCategory(expenseDraft.category) : "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold">Amount:</span>{" "}
                    {expenseDraft.amountDollars ? `$${expenseDraft.amountDollars}` : "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold">Date:</span> {expenseDraft.expenseDate || "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold">Recurring:</span>{" "}
                    {expenseDraft.recurring
                      ? `Yes (${expenseDraft.recurringFrequency || "frequency missing"})`
                      : "No"}
                  </p>
                </div>
                <form className="space-y-3" action={createAction}>
                  <input type="hidden" name="propertyId" value={expenseDraft.propertyId} />
                  <input type="hidden" name="category" value={expenseDraft.category} />
                  <input type="hidden" name="amountDollars" value={expenseDraft.amountDollars} />
                  <input type="hidden" name="expenseDate" value={expenseDraft.expenseDate} />
                  <input
                    type="hidden"
                    name="recurring"
                    value={expenseDraft.recurring ? "true" : "false"}
                  />
                  <input
                    type="hidden"
                    name="recurringFrequency"
                    value={expenseDraft.recurring ? expenseDraft.recurringFrequency : ""}
                  />
                  <input type="hidden" name="vendorId" value={expenseDraft.vendorId} />
                  <input type="hidden" name="receiptFileId" value={expenseDraft.receiptFileId} />
                  <input type="hidden" name="description" value={expenseDraft.description} />
                  <Input name="receiptFile" type="file" />
                  <SubmitButton
                    className="w-full"
                    disabled={!createRequiredComplete}
                    title="Create this expense record."
                  >
                    Save Expense
                  </SubmitButton>
                </form>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateStep((current) => Math.max(current - 1, 0))}
                disabled={createStep === 0}
                title="Go back one step."
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => setCreateStep((current) => Math.min(current + 1, CREATE_EXPENSE_STEPS.length - 1))}
                disabled={createStep >= CREATE_EXPENSE_STEPS.length - 1 || !createStepComplete(createStep)}
                title="Complete this step and move to the next step."
              >
                Next
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  markCreateStepSkipped(createStep);
                  setCreateStep((current) => Math.min(current + 1, CREATE_EXPENSE_STEPS.length - 1));
                }}
                disabled={!canSkipCreateStep(createStep)}
                title="Skip this optional step for now and continue."
              >
                Skip for now
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateStep(0);
                  setSkippedCreateSteps([]);
                }}
                title="Restart expense entry from step one."
              >
                Restart
              </Button>
            </div>
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
                    <p className="text-lg font-semibold text-emerald-700">{formatCurrency(selectedSummary.incomeCents)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Expenses</p>
                    <p className="text-lg font-semibold text-rose-700">{formatCurrency(selectedSummary.expenseCents)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Net Cashflow</p>
                    <p className="text-lg font-semibold text-violet-700">{formatCurrency(selectedSummary.netCents)}</p>
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
                        <span className="text-zinc-500">Income {formatCurrency(row.incomeCents)}</span>
                        <span className="text-zinc-500">Expense {formatCurrency(row.expenseCents)}</span>
                        <span className="font-semibold text-zinc-900">Net {formatCurrency(row.netCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Expense Categories
                  </p>
                  {(data.categoryByProperty[selectedPropertyId] ?? []).length === 0 ? (
                    <EmptyState message="No expenses yet for this property. Add one to start category tracking." />
                  ) : (
                    <div className="space-y-1">
                      {(data.categoryByProperty[selectedPropertyId] ?? []).map((row) => (
                        <div key={row.category} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-xs">
                          <span>{formatCategory(row.category)}</span>
                          <span className="font-semibold">{formatCurrency(row.totalCents)}</span>
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
        <p className="text-sm font-semibold text-zinc-900">
          {expense.propertyName} • {formatCategory(expense.category)}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {formatDate(expense.expenseDate)}
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
                <Badge variant="outline">{formatCurrency(expense.amountCents)}</Badge>
              </div>
              {updateState && !updateState.success && (
                <p className="sm:col-span-3 text-xs text-red-500">{updateState.error}</p>
              )}
              {updateState && updateState.success && (
                <p className="sm:col-span-3 text-xs text-emerald-600">Expense updated.</p>
              )}
            </form>

            <form
              action={deleteAction}
              className="mt-2"
              ref={deleteFormRef}
            >
              <input type="hidden" name="expenseId" value={expense.id} />
              <SubmitButton
                size="sm"
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  setConfirmDeleteOpen(true);
                }}
                title="Delete this expense record permanently."
              >
                Delete
              </SubmitButton>
              {deleteState && !deleteState.success && (
                <p className="mt-1 text-xs text-red-500">{deleteState.error}</p>
              )}
              {deleteState && deleteState.success && (
                <p className="mt-1 text-xs text-emerald-600">Expense deleted.</p>
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
      <ConfirmDialog
        title="Delete Expense?"
        description="Are you sure? This will permanently delete this expense record."
        confirmLabel="Delete Expense"
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => deleteFormRef.current?.requestSubmit()}
      />
    </DataRow>
  );
}
