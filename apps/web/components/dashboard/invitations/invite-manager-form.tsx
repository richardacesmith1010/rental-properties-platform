"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormError } from "@/components/dashboard/forms";
import { Alert } from "@/components/ui/alert";
import { toast } from "sonner";

const MANAGER_STEPS = ["Home", "Email", "Name", "Send"] as const;

interface ManagerInviteDraft {
  propertyIds: string[];
  email: string;
  fullName: string;
}

function StepPill({ label, active, done, skipped }: { label: string; active: boolean; done: boolean; skipped: boolean }) {
  const className = active
    ? "border-[var(--accent-line)] bg-[var(--accent-weak)] text-[var(--accent-strong)]"
    : done
      ? "border-[var(--pos)] bg-[var(--pos-bg)] text-[var(--pos)]"
      : skipped
        ? "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)]"
        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function InviteManagerForm({ properties, onInviteManager, onSuccess }: {
  properties: Array<{ id: string; name: string; ownerAccountIsClient?: boolean; active?: boolean }>;
  onInviteManager: StatefulAction;
  onSuccess?: () => void;
}) {
  const [state, action] = useFormState(onInviteManager, null);
  const handledRef = useRef<ActionState>(null);
  const eligibleHomes = useMemo(
    () => properties.filter((property) => property.ownerAccountIsClient !== true && property.active !== false),
    [properties]
  );
  const eligibleIds = useMemo(() => eligibleHomes.map((property) => property.id), [eligibleHomes]);
  const eligibilityKey = eligibleIds.join("\0");
  const previousEligibility = useRef(eligibilityKey);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ManagerInviteDraft>({
    propertyIds: eligibleIds.length === 1 ? eligibleIds : [], email: "", fullName: ""
  });
  const pickedIds = eligibleIds.filter((id) => draft.propertyIds.includes(id));
  const requiredComplete = Boolean(pickedIds.length && draft.email && draft.fullName);
  const stepComplete = (index: number) => index === 0 ? Boolean(pickedIds.length)
    : index === 1 ? Boolean(draft.email) : index === 2 ? Boolean(draft.fullName) : requiredComplete;

  useEffect(() => {
    const eligibilityChanged = previousEligibility.current !== eligibilityKey;
    previousEligibility.current = eligibilityKey;
    setDraft((current) => {
      const stillEligible = current.propertyIds.filter((id) => eligibleIds.includes(id));
      const next = eligibilityChanged && stillEligible.length === 0 && eligibleIds.length === 1
        ? eligibleIds : stillEligible;
      return next.length === current.propertyIds.length && next.every((id, index) => id === current.propertyIds[index])
        ? current : { ...current, propertyIds: next };
    });
  }, [eligibilityKey, eligibleIds]);

  useEffect(() => {
    if (!state?.success) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    toast.success(state.message ?? "Invite complete.");
    setDraft({ propertyIds: eligibleIds.length === 1 ? eligibleIds : [], email: "", fullName: "" });
    setStep(0);
    onSuccess?.();
  }, [eligibleIds, onSuccess, state]);

  const onEnterNext = (event: KeyboardEvent<HTMLInputElement>, canAdvance: boolean, nextStep: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setStep(nextStep);
  };

  return (
      <div className="space-y-4">
      <FormError state={state} />
      {state?.success ? <Alert variant="success" className="h-auto whitespace-normal break-words">
        {state.message ?? "Invite complete."}
      </Alert> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MANAGER_STEPS.map((label, index) => (
          <StepPill key={label} label={label} active={step === index} done={stepComplete(index)} skipped={false} />
        ))}
      </div>
      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 1: Pick homes.</p>
          {eligibleHomes.length === 0 ? <p className="text-sm text-[var(--muted)]">No homes here can get a manager.</p> : (
            <div className="space-y-1">
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ink)]">
                <input type="checkbox" checked={pickedIds.length === eligibleHomes.length}
                  onChange={(event) => setDraft((current) => ({
                    ...current, propertyIds: event.target.checked ? eligibleIds : []
                  }))} />
                All my homes
              </label>
              {eligibleHomes.map((property) => (
                <label key={property.id} className="flex min-h-11 items-center gap-3 text-sm text-[var(--ink)]">
                  <input type="checkbox" checked={pickedIds.includes(property.id)}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      propertyIds: event.target.checked
                        ? [...current.propertyIds, property.id] : current.propertyIds.filter((id) => id !== property.id)
                    }))} />
                  {property.name}
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 2: Enter manager email address.</p>
          <Input type="email" value={draft.email}
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            onKeyDown={(event) => onEnterNext(event, stepComplete(step), 2)}
            placeholder="manager@email.com" required />
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Step 3: Enter manager full name.</p>
          <Input value={draft.fullName}
            onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
            onKeyDown={(event) => onEnterNext(event, stepComplete(step), 3)}
            placeholder="Manager full name" required />
        </div>
      ) : null}
      {step === 3 ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-2)]">Final step: review and send manager invite.</p>
          <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--ink-2)]">
            <p>
              <span className="font-semibold">Homes:</span>{" "}
              {eligibleHomes.filter((property) => pickedIds.includes(property.id)).map((property) => property.name).join(", ")}
            </p>
            <p><span className="font-semibold">Email:</span> {draft.email || "Not set"}</p>
            <p><span className="font-semibold">Name:</span> {draft.fullName || "Not set"}</p>
          </div>
          <form className="space-y-2" action={action}>
            <input type="hidden" name="propertyIds" value={JSON.stringify(pickedIds)} />
            <input type="hidden" name="email" value={draft.email} />
            <input type="hidden" name="fullName" value={draft.fullName} />
            <SubmitButton className="w-full" disabled={!requiredComplete} title="Send manager invitation.">
              Send Manager Invite
            </SubmitButton>
          </form>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(current - 1, 0))}
          disabled={step === 0} title="Go back one step.">
          Back
        </Button>
        {step < MANAGER_STEPS.length - 1 ? <Button type="button"
          onClick={() => setStep((current) => Math.min(current + 1, MANAGER_STEPS.length - 1))}
          disabled={!stepComplete(step)} title="Complete this step and move to the next one.">
          Next
        </Button> : null}
      </div>
    </div>
  );
}
