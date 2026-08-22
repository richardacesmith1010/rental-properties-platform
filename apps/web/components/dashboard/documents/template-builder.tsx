"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction } from "@/app/actions";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormError, FormSuccess } from "@/components/dashboard/forms";

export interface TemplateBuilderProps {
  existingTemplate?: { id: string; name: string; category: string; bodyMarkdown: string };
  ownershipAccounts: OwnershipAccountDTO[];
  onSave: StatefulAction;
  onCancel: () => void;
}

interface TemplateDraft {
  name: string;
  category: string;
  ownerAccountId: string;
  bodyMarkdown: string;
}

const TEMPLATE_STEPS = ["Template Name", "Category", "Ownership", "Template Body", "Review & Save"] as const;

function StepPill({ label, active, done, skipped }: { label: string; active: boolean; done: boolean; skipped: boolean }) {
  const className = active
    ? "border-[var(--accent-line)] bg-[var(--accent-weak)] text-[var(--accent)]"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function TemplateBuilder({ existingTemplate, ownershipAccounts, onSave, onCancel }: TemplateBuilderProps) {
  const [state, action] = useFormState(onSave, null);
  const [step, setStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>({
    name: existingTemplate?.name ?? "",
    category: existingTemplate?.category ?? "",
    ownerAccountId: "",
    bodyMarkdown: existingTemplate?.bodyMarkdown ?? ""
  });

  const requiredComplete = Boolean(draft.name && draft.category && draft.bodyMarkdown);
  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.name);
    if (index === 1) return Boolean(draft.category);
    if (index === 2) return true;
    if (index === 3) return Boolean(draft.bodyMarkdown);
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    setDraft({ name: "", category: "", ownerAccountId: "", bodyMarkdown: "" });
    setStep(0);
    setSkippedSteps([]);
  }, [state]);

  const onEnterNext = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    canAdvance: boolean,
    nextStep: number
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setStep(nextStep);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Document Workflow</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} title="Return to document workflow options.">
            Back to flows
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600">One step at a time. Press Enter or Next to continue. Skip is available when it makes sense.</p>
        <FormError state={state} />
        <FormSuccess state={state} message="Template saved." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TEMPLATE_STEPS.map((label, index) => (
            <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={skippedSteps.includes(index)} />
          ))}
        </div>
        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 1: Enter a template name.</p>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 1)} placeholder="Template name" required />
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 2: Enter template category (Lease, Notice, Addendum).</p>
            <Input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 2)} placeholder="Category" required />
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 3: Choose ownership account (optional).</p>
            <Select value={draft.ownerAccountId} onChange={(event) => setDraft((current) => ({ ...current, ownerAccountId: event.target.value }))}>
              <option value="">Default ownership account</option>
              {ownershipAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.displayName}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 4: Write the template body text.</p>
            <Textarea value={draft.bodyMarkdown} onChange={(event) => setDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 4)} rows={6} placeholder="Template body (markdown/text)" required />
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Final step: review and save template.</p>
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <p><span className="font-semibold">Name:</span> {draft.name || "Not set"}</p>
              <p><span className="font-semibold">Category:</span> {draft.category || "Not set"}</p>
              <p><span className="font-semibold">Owner Account:</span> {ownershipAccounts.find((account) => account.id === draft.ownerAccountId)?.displayName ?? "Default ownership account"}</p>
            </div>
            <form className="space-y-2" action={action}>
              <input type="hidden" name="name" value={draft.name} />
              <input type="hidden" name="category" value={draft.category} />
              <input type="hidden" name="ownerAccountId" value={draft.ownerAccountId} />
              <input type="hidden" name="bodyMarkdown" value={draft.bodyMarkdown} />
              <SubmitButton className="w-full" disabled={!requiredComplete} title="Save this template.">Save Template</SubmitButton>
            </form>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} title="Go back one step.">Back</Button>
          <Button type="button" onClick={() => setStep((current) => Math.min(current + 1, TEMPLATE_STEPS.length - 1))} disabled={step >= TEMPLATE_STEPS.length - 1 || !stepComplete(step)} title="Complete this step and move to the next step.">Next</Button>
          <Button type="button" variant="outline" onClick={() => { setSkippedSteps((previous) => (previous.includes(step) ? previous : [...previous, step])); setStep((current) => Math.min(current + 1, TEMPLATE_STEPS.length - 1)); }} disabled={step >= TEMPLATE_STEPS.length - 1} title="Skip this step for now and continue.">Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
