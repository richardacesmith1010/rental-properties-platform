"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";

const TENANT_STEPS = ["Pick Property", "Tenant Email", "Tenant Name", "Review & Send"] as const;

interface TenantInviteDraft {
  propertyId: string;
  email: string;
  fullName: string;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{state.error}</p>;
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">Invitation sent!</p>;
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

export function InviteTenantForm({ properties, onInviteTenant, onSuccess }: { properties: Array<{ id: string; name: string }>; onInviteTenant: StatefulAction; onSuccess?: () => void; }) {
  const [state, action] = useFormState(onInviteTenant, null);
  const handledRef = useRef<ActionState>(null);
  const [step, setStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<TenantInviteDraft>({ propertyId: "", email: "", fullName: "" });
  const requiredComplete = Boolean(draft.propertyId && draft.email && draft.fullName);
  const stepComplete = (index: number) => index === 0 ? Boolean(draft.propertyId) : index === 1 ? Boolean(draft.email) : index === 2 ? Boolean(draft.fullName) : requiredComplete;

  useEffect(() => {
    if (!state?.success) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    setDraft({ propertyId: "", email: "", fullName: "" });
    setStep(0);
    setSkippedSteps([]);
    onSuccess?.();
  }, [onSuccess, state]);

  const onEnterNext = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, canAdvance: boolean, nextStep: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setStep(nextStep);
  };

  return (
    <div className="space-y-4">
      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{TENANT_STEPS.map((label, index) => <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={skippedSteps.includes(index)} />)}</div>
      {step === 0 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 1: Pick the property first. Tenant invites are always property-linked.</p><Select value={draft.propertyId} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 1)} required><option value="">Assign to property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</Select></div> : null}
      {step === 1 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 2: Enter tenant email address.</p><Input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 2)} placeholder="tenant@email.com" required /></div> : null}
      {step === 2 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Step 3: Enter tenant full legal name.</p><Input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} onKeyDown={(event) => onEnterNext(event, stepComplete(step), 3)} placeholder="Tenant full name" required /></div> : null}
      {step === 3 ? <div className="space-y-3"><p className="text-sm text-zinc-600">Final step: review and send tenant invite.</p><div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700"><p><span className="font-semibold">Property:</span> {properties.find((property) => property.id === draft.propertyId)?.name ?? "Not set"}</p><p><span className="font-semibold">Email:</span> {draft.email || "Not set"}</p><p><span className="font-semibold">Name:</span> {draft.fullName || "Not set"}</p></div><form className="space-y-2" action={action}><input type="hidden" name="propertyId" value={draft.propertyId} /><input type="hidden" name="email" value={draft.email} /><input type="hidden" name="fullName" value={draft.fullName} /><SubmitButton className="w-full" disabled={!requiredComplete} title="Send tenant invitation.">Send Tenant Invite</SubmitButton></form></div> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} title="Go back one step.">Back</Button><Button type="button" onClick={() => setStep((current) => Math.min(current + 1, TENANT_STEPS.length - 1))} disabled={step >= TENANT_STEPS.length - 1 || !stepComplete(step)} title="Complete this step and move to the next one.">Next</Button><Button type="button" variant="outline" onClick={() => { setSkippedSteps((previous) => (previous.includes(step) ? previous : [...previous, step])); setStep((current) => Math.min(current + 1, TENANT_STEPS.length - 1)); }} disabled={step >= TENANT_STEPS.length - 1} title="Skip this step for now and continue.">Skip for now</Button></div>
    </div>
  );
}
