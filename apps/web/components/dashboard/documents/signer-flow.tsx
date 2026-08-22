"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { FileArchive } from "lucide-react";
import type { StatefulAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";

type ActionState = Awaited<ReturnType<StatefulAction>>;

const unavailableAction: StatefulAction = async () => ({ success: false, error: "Action unavailable." });

export interface SignerFlowProps {
  properties: Array<{ id: string; name: string }>;
  propertyFilesEnabled?: boolean;
  onUploadPropertyFile?: StatefulAction;
  onCancel: () => void;
}

interface FileDraft {
  propertyId: string;
  category: string;
  visibility: "owner_manager" | "all";
  description: string;
}

const FILE_STEPS = ["Select Property", "Category", "Visibility", "Description", "Upload"] as const;

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

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <Alert variant="error">{state.error}</Alert>;
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return <Alert variant="success">File uploaded.</Alert>;
}

export function SignerFlow({ properties, propertyFilesEnabled = true, onUploadPropertyFile, onCancel }: SignerFlowProps) {
  const [state, action] = useFormState(onUploadPropertyFile ?? unavailableAction, null);
  const [step, setStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<FileDraft>({
    propertyId: "",
    category: "",
    visibility: "owner_manager",
    description: ""
  });

  const metadataComplete = Boolean(draft.propertyId && draft.category && draft.visibility);

  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.propertyId);
    if (index === 1) return Boolean(draft.category);
    if (index === 2) return Boolean(draft.visibility);
    if (index === 3) return true;
    return metadataComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    setDraft({ propertyId: "", category: "", visibility: "owner_manager", description: "" });
    setStep(0);
    setSkippedSteps([]);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Document Workflow</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} title="Return to document workflow options.">Back to flows</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600">One step at a time. Press Enter or Next to continue. Skip is available when it makes sense.</p>
        <FormError state={state} />
        <FormSuccess state={state} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {FILE_STEPS.map((label, index) => (
            <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={skippedSteps.includes(index)} />
          ))}
        </div>
        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 1: Select property for the file.</p>
            <Select value={draft.propertyId} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}>
              <option value="">Select property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </Select>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 2: Select file category.</p>
            <Select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>
              <option value="">Select category</option>
              <option value="lease_agreement">Lease Agreement</option>
              <option value="inspection">Inspection</option>
              <option value="insurance">Insurance</option>
              <option value="tax">Tax</option>
              <option value="receipt">Receipt</option>
              <option value="other">Other</option>
            </Select>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 3: Choose visibility level.</p>
            <Select value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as FileDraft["visibility"] }))}>
              <option value="owner_manager">Owner + Manager only</option>
              <option value="all">Visible to tenant</option>
            </Select>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 4: Add description (optional).</p>
            <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Description (optional)" />
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Final step: choose file and upload.</p>
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <p><span className="font-semibold">Property:</span> {properties.find((property) => property.id === draft.propertyId)?.name ?? "Not set"}</p>
              <p><span className="font-semibold">Category:</span> {draft.category || "Not set"}</p>
              <p><span className="font-semibold">Visibility:</span> {draft.visibility === "all" ? "Tenant visible" : "Owner/Manager only"}</p>
            </div>
            {propertyFilesEnabled ? (
              <form className="space-y-2" action={action}>
                <input type="hidden" name="propertyId" value={draft.propertyId} />
                <input type="hidden" name="category" value={draft.category} />
                <input type="hidden" name="visibility" value={draft.visibility} />
                <input type="hidden" name="description" value={draft.description} />
                <Input name="file" type="file" required />
                <SubmitButton className="w-full" disabled={!metadataComplete} title="Upload file to property vault.">Upload File</SubmitButton>
              </form>
            ) : (
              <EmptyState icon={FileArchive} title="Property file vault unavailable" description="Property file vault is not enabled yet." />
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} title="Go back one step.">Back</Button>
          <Button type="button" onClick={() => setStep((current) => Math.min(current + 1, FILE_STEPS.length - 1))} disabled={step >= FILE_STEPS.length - 1 || !stepComplete(step)} title="Complete this step and move to the next step.">Next</Button>
          <Button type="button" variant="outline" onClick={() => { setSkippedSteps((previous) => (previous.includes(step) ? previous : [...previous, step])); setStep((current) => Math.min(current + 1, FILE_STEPS.length - 1)); }} disabled={step >= FILE_STEPS.length - 1} title="Skip this step for now and continue.">Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
