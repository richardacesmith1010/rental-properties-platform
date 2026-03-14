"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction } from "@/app/actions";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { VendorDTO } from "@/lib/vendors";
import type { PropertyFileDTO } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormError, FormSuccess } from "@/components/dashboard/forms";

const expenseCategories = ["mortgage", "insurance", "property_tax", "hoa", "repair", "maintenance", "utility", "management_fee", "legal", "other"];
const recurringFrequencies = ["monthly", "quarterly", "annually"];
const CREATE_EXPENSE_STEPS = ["Property", "Category", "Amount", "Date", "Recurring", "Vendor", "Receipt", "Description", "Review & Save"] as const;

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
  return category.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function StepPill({ label, active, done, skipped }: { label: string; active: boolean; done: boolean; skipped: boolean }) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function ExpenseForm({ data, vendors, propertyFiles, onCreateExpense }: { data: ExpenseDashboardData; vendors: VendorDTO[]; propertyFiles: PropertyFileDTO[]; onCreateExpense: StatefulAction }) {
  const [state, action] = useFormState(onCreateExpense, null);
  const [step, setStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft>({
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

  const availableVendors = useMemo(() => [...vendors].sort((left, right) => left.name.localeCompare(right.name)), [vendors]);
  const availableCreateReceiptFiles = useMemo(() => propertyFiles.filter((file) => !draft.propertyId || file.propertyId === draft.propertyId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [draft.propertyId, propertyFiles]);
  const requiredComplete = Boolean(draft.propertyId && draft.category && Number(draft.amountDollars) > 0 && draft.expenseDate && (!draft.recurring || draft.recurringFrequency));
  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.propertyId);
    if (index === 1) return Boolean(draft.category);
    if (index === 2) return Number(draft.amountDollars) > 0;
    if (index === 3) return Boolean(draft.expenseDate);
    if (index === 4) return !draft.recurring || Boolean(draft.recurringFrequency);
    if (index === 5 || index === 6 || index === 7) return true;
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    setStep(0);
    setSkippedSteps([]);
    setDraft({ propertyId: data.properties[0]?.id ?? "", category: "maintenance", amountDollars: "", expenseDate: "", recurring: false, recurringFrequency: "", vendorId: "", receiptFileId: "", description: "" });
  }, [data.properties, state]);

  const onEnterNext = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, canAdvance: boolean, nextStep: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setStep(nextStep);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Create Expense</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600">One field at a time. Press Enter or Next to continue. Optional steps can be skipped.</p>
        <FormError state={state} />
        <FormSuccess state={state} message="Expense created." />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
          {CREATE_EXPENSE_STEPS.map((label, index) => <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={skippedSteps.includes(index)} />)}
        </div>
        {step === 0 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 1: Select the property this expense belongs to.</p><Select value={draft.propertyId} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value, receiptFileId: "" }))}><option value="">Select property</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</Select></div> : null}
        {step === 1 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 2: Choose the expense category.</p><Select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>{expenseCategories.map((category) => <option key={category} value={category}>{formatCategory(category)}</option>)}</Select></div> : null}
        {step === 2 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 3: Enter amount in US dollars.</p><Input value={draft.amountDollars} onChange={(event) => setDraft((current) => ({ ...current, amountDollars: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 3)} type="number" min={0.01} step="0.01" placeholder="Amount (USD)" required /></div> : null}
        {step === 3 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 4: Select the date of the expense.</p><Input value={draft.expenseDate} onChange={(event) => setDraft((current) => ({ ...current, expenseDate: event.target.value }))} type="date" required /></div> : null}
        {step === 4 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 5: Set recurring behavior.</p><label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" checked={draft.recurring} onChange={(event) => setDraft((current) => ({ ...current, recurring: event.target.checked, recurringFrequency: event.target.checked ? current.recurringFrequency : "" }))} />Recurring expense</label><Select value={draft.recurringFrequency} onChange={(event) => setDraft((current) => ({ ...current, recurringFrequency: event.target.value }))} disabled={!draft.recurring}><option value="">Not recurring</option>{recurringFrequencies.map((frequency) => <option key={frequency} value={frequency}>{formatCategory(frequency)}</option>)}</Select></div> : null}
        {step === 5 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 6: Link a vendor (optional).</p><Select value={draft.vendorId} onChange={(event) => setDraft((current) => ({ ...current, vendorId: event.target.value }))}><option value="">No vendor linked</option>{availableVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</Select></div> : null}
        {step === 6 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 7: Link an existing receipt file (optional).</p><Select value={draft.receiptFileId} onChange={(event) => setDraft((current) => ({ ...current, receiptFileId: event.target.value }))}><option value="">No existing receipt file</option>{availableCreateReceiptFiles.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}</Select></div> : null}
        {step === 7 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 8: Add description (optional).</p><Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} onKeyDown={(event) => onEnterNext(event, true, 8)} rows={2} placeholder="Description (optional)" /></div> : null}
        {step === 8 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Final step: review details and save.</p><div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700"><p><span className="font-semibold">Property:</span> {data.properties.find((property) => property.id === draft.propertyId)?.name ?? "Not set"}</p><p><span className="font-semibold">Category:</span> {formatCategory(draft.category)}</p><p><span className="font-semibold">Amount:</span> {draft.amountDollars ? `$${draft.amountDollars}` : "Not set"}</p><p><span className="font-semibold">Date:</span> {draft.expenseDate || "Not set"}</p><p><span className="font-semibold">Recurring:</span> {draft.recurring ? `Yes (${draft.recurringFrequency || "frequency missing"})` : "No"}</p></div><form className="space-y-3" action={action}><input type="hidden" name="propertyId" value={draft.propertyId} /><input type="hidden" name="category" value={draft.category} /><input type="hidden" name="amountDollars" value={draft.amountDollars} /><input type="hidden" name="expenseDate" value={draft.expenseDate} /><input type="hidden" name="recurring" value={draft.recurring ? "true" : "false"} /><input type="hidden" name="recurringFrequency" value={draft.recurring ? draft.recurringFrequency : ""} /><input type="hidden" name="vendorId" value={draft.vendorId} /><input type="hidden" name="receiptFileId" value={draft.receiptFileId} /><input type="hidden" name="description" value={draft.description} /><Input name="receiptFile" type="file" /><SubmitButton className="w-full" disabled={!requiredComplete} title="Create this expense record.">Save Expense</SubmitButton></form></div> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} title="Go back one step.">Back</Button>
          <Button type="button" onClick={() => setStep((current) => Math.min(current + 1, CREATE_EXPENSE_STEPS.length - 1))} disabled={step >= CREATE_EXPENSE_STEPS.length - 1 || !stepComplete(step)} title="Complete this step and move to the next step.">Next</Button>
          <Button type="button" variant="outline" onClick={() => { setSkippedSteps((previous) => (previous.includes(step) ? previous : [...previous, step])); setStep((current) => Math.min(current + 1, CREATE_EXPENSE_STEPS.length - 1)); }} disabled={!(step >= 5 && step <= 7)} title="Skip this optional step for now and continue.">Skip for now</Button>
          <Button type="button" variant="outline" onClick={() => { setStep(0); setSkippedSteps([]); }} title="Restart expense entry from step one.">Restart</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { formatCategory, expenseCategories };
