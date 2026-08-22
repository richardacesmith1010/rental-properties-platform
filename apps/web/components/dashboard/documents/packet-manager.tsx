"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction } from "@/app/actions";
import type { DocumentTemplateDTO } from "@/lib/documents";
import type { LeaseListItem } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormError, FormSuccess } from "@/components/dashboard/forms";

export interface PacketManagerProps {
  templates: DocumentTemplateDTO[];
  leases: LeaseListItem[];
  onCreatePacket: StatefulAction;
  onCancel: () => void;
}

interface PacketDraft {
  templateId: string;
  leaseId: string;
}

const PACKET_STEPS = ["Select Template", "Select Lease", "Review & Save"] as const;

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

export function PacketManager({ templates, leases, onCreatePacket, onCancel }: PacketManagerProps) {
  const [state, action] = useFormState(onCreatePacket, null);
  const [step, setStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<PacketDraft>({ templateId: "", leaseId: "" });
  const activeLeases = leases.filter((lease) => lease.active);
  const requiredComplete = Boolean(draft.templateId && draft.leaseId);
  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.templateId);
    if (index === 1) return Boolean(draft.leaseId);
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    setDraft({ templateId: "", leaseId: "" });
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
        <FormSuccess state={state} message="Packet created as draft." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PACKET_STEPS.map((label, index) => (
            <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={skippedSteps.includes(index)} />
          ))}
        </div>
        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 1: Select source template.</p>
            <Select value={draft.templateId} onChange={(event) => setDraft((current) => ({ ...current, templateId: event.target.value }))}>
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name} ({template.category})</option>
              ))}
            </Select>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 2: Select lease to attach this packet.</p>
            <Select value={draft.leaseId} onChange={(event) => setDraft((current) => ({ ...current, leaseId: event.target.value }))}>
              <option value="">Select lease</option>
              {activeLeases.map((lease) => (
                <option key={lease.id} value={lease.id}>{lease.unitLabel} • {lease.tenantEmail}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Final step: review and create draft packet.</p>
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <p><span className="font-semibold">Template:</span> {templates.find((template) => template.id === draft.templateId)?.name ?? "Not set"}</p>
              <p><span className="font-semibold">Lease:</span> {activeLeases.find((lease) => lease.id === draft.leaseId)?.unitLabel ?? "Not set"}</p>
            </div>
            <form className="space-y-2" action={action}>
              <input type="hidden" name="templateId" value={draft.templateId} />
              <input type="hidden" name="leaseId" value={draft.leaseId} />
              <SubmitButton className="w-full" disabled={!requiredComplete} title="Create draft packet.">Create Draft Packet</SubmitButton>
            </form>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} title="Go back one step.">Back</Button>
          <Button type="button" onClick={() => setStep((current) => Math.min(current + 1, PACKET_STEPS.length - 1))} disabled={step >= PACKET_STEPS.length - 1 || !stepComplete(step)} title="Complete this step and move to the next step.">Next</Button>
          <Button type="button" variant="outline" onClick={() => { setSkippedSteps((previous) => (previous.includes(step) ? previous : [...previous, step])); setStep((current) => Math.min(current + 1, PACKET_STEPS.length - 1)); }} disabled={step >= PACKET_STEPS.length - 1} title="Skip this step for now and continue.">Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
