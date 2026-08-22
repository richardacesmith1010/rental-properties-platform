"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FieldLabel, FormError, FormSuccess } from "./form-helpers";

interface PropertyDraft {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  ownerAccountId: string;
}

const PROPERTY_STEP_LABELS = [
  "Property Name",
  "Street Address (optional)",
  "City (optional)",
  "State (optional)",
  "ZIP Code (optional)",
  "Ownership Account",
  "Review & Save"
] as const;

interface PropertyFormProps {
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateProperty: StatefulAction;
  onPropertyCreated?: () => void;
  onBack: () => void;
}

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

export function PropertyForm({
  ownershipAccounts,
  onCreateProperty,
  onPropertyCreated,
  onBack
}: PropertyFormProps) {
  const [state, action] = useFormState(onCreateProperty, null);
  const handledStateRef = useRef<ActionState>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<PropertyDraft>({
    name: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    ownerAccountId: ""
  });

  const requiredComplete = useMemo(() => Boolean(draft.name), [draft.name]);

  const stepComplete = (step: number) => {
    if (step === 0) return Boolean(draft.name);
    return step === PROPERTY_STEP_LABELS.length - 1 ? requiredComplete : true;
  };

  useEffect(() => {
    if (!state?.success) return;
    if (handledStateRef.current === state) return;
    handledStateRef.current = state;
    setStepIndex(0);
    setSkippedSteps([]);
    setDraft({
      name: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      ownerAccountId: ""
    });
    onPropertyCreated?.();
  }, [onPropertyCreated, state]);

  const handleEnterAdvance = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    canAdvance: boolean,
    nextStep: number
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) {
      setStepIndex(nextStep);
    }
  };

  const next = () => setStepIndex((current) => Math.min(current + 1, PROPERTY_STEP_LABELS.length - 1));
  const back = () => setStepIndex((current) => Math.max(current - 1, 0));

  const renderStep = () => {
    if (stepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 1: Property name. This is the label owners and managers will see everywhere.
          </p>
          <FieldLabel htmlFor="property-name" required>
            Property Name
          </FieldLabel>
          <Input
            id="property-name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 1)}
            placeholder="Example: Elm Street House"
            required
          />
        </div>
      );
    }

    if (stepIndex === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 2: Street address (optional).</p>
          <FieldLabel htmlFor="property-address">Street Address</FieldLabel>
          <Input
            id="property-address"
            value={draft.addressLine1}
            onChange={(event) => setDraft((current) => ({ ...current, addressLine1: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, true, 2)}
            placeholder="123 Main St"
          />
        </div>
      );
    }

    if (stepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: City (optional).</p>
          <FieldLabel htmlFor="property-city">City</FieldLabel>
          <Input
            id="property-city"
            value={draft.city}
            onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, true, 3)}
            placeholder="City"
          />
        </div>
      );
    }

    if (stepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 4: State abbreviation (optional), for example CO.</p>
          <FieldLabel htmlFor="property-state">State</FieldLabel>
          <Input
            id="property-state"
            value={draft.state}
            onChange={(event) =>
              setDraft((current) => ({ ...current, state: event.target.value.toUpperCase() }))
            }
            onKeyDown={(event) => handleEnterAdvance(event, true, 4)}
            placeholder="State"
            maxLength={2}
          />
        </div>
      );
    }

    if (stepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 5: ZIP code (optional).</p>
          <FieldLabel htmlFor="property-zip">ZIP Code</FieldLabel>
          <Input
            id="property-zip"
            value={draft.postalCode}
            onChange={(event) => setDraft((current) => ({ ...current, postalCode: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, true, 5)}
            placeholder="ZIP code"
          />
        </div>
      );
    }

    if (stepIndex === 5) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 6: Ownership account (optional).</p>
          <FieldLabel htmlFor="property-owner-account">Ownership Account</FieldLabel>
          <Select
            id="property-owner-account"
            value={draft.ownerAccountId}
            onChange={(event) => setDraft((current) => ({ ...current, ownerAccountId: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, true, 6)}
          >
            <option value="">Default ownership account</option>
            {ownershipAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and save the property.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Name:</span> {draft.name || "Not set"}</p>
          <p><span className="font-semibold">Address:</span> {draft.addressLine1 || "Not set"}</p>
          <p><span className="font-semibold">City:</span> {draft.city || "Not set"}</p>
          <p><span className="font-semibold">State:</span> {draft.state || "Not set"}</p>
          <p><span className="font-semibold">ZIP:</span> {draft.postalCode || "Not set"}</p>
          <p>
            <span className="font-semibold">Ownership:</span>{" "}
            {ownershipAccounts.find((account) => account.id === draft.ownerAccountId)?.displayName ?? "Default ownership account"}
          </p>
        </div>
        {!requiredComplete && <p className="text-xs text-amber-700">Property name is still required before save.</p>}
        <form className="space-y-2" action={action}>
          <input type="hidden" name="name" value={draft.name} />
          <input type="hidden" name="addressLine1" value={draft.addressLine1} />
          <input type="hidden" name="city" value={draft.city} />
          <input type="hidden" name="state" value={draft.state} />
          <input type="hidden" name="postalCode" value={draft.postalCode} />
          <input type="hidden" name="ownerAccountId" value={draft.ownerAccountId} />
          <SubmitButton className="w-full" title="Save this property." disabled={!requiredComplete}>
            Save Property
          </SubmitButton>
        </form>
      </div>
    );
  };

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Add Property</CardTitle>
            <p className="text-xs text-zinc-500">One field at a time. Press Enter or click Next.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onBack} title="Return to setup options.">
            Back to tasks
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormError state={state} />
        <FormSuccess state={state} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROPERTY_STEP_LABELS.map((label, index) => (
            <StepPill
              key={label}
              label={label}
              active={stepIndex === index}
              done={stepComplete(index)}
              skipped={skippedSteps.includes(index)}
            />
          ))}
        </div>

        {renderStep()}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={back} disabled={stepIndex === 0} title="Go back one step.">
            Back
          </Button>
          <Button
            type="button"
            onClick={next}
            disabled={stepIndex >= PROPERTY_STEP_LABELS.length - 1 || !stepComplete(stepIndex)}
            title="Complete this step and move to the next step."
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSkippedSteps((previous) => (previous.includes(stepIndex) ? previous : [...previous, stepIndex]));
              next();
            }}
            disabled={stepIndex >= PROPERTY_STEP_LABELS.length - 1}
            title="Skip this step for now and continue."
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
