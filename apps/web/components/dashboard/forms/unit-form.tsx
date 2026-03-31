"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { PortfolioData } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FieldLabel, FormError, FormSuccess } from "./form-helpers";

interface UnitDraft {
  propertyId: string;
  unitNumber: string;
  bedrooms: string;
  bathrooms: string;
  monthlyRentDollars: string;
}

const UNIT_STEP_LABELS = [
  "Pick Property",
  "Unit Label",
  "Bedrooms",
  "Bathrooms",
  "Default Rent",
  "Review & Save"
] as const;

interface UnitFormProps {
  portfolio: PortfolioData;
  onCreateUnit: StatefulAction;
  onUnitCreated?: () => void;
  onBack: () => void;
  initialPropertyId?: string | null;
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

export function UnitForm({
  portfolio,
  onCreateUnit,
  onUnitCreated,
  onBack,
  initialPropertyId = null
}: UnitFormProps) {
  const getDefaultPropertyId = useCallback(
    () =>
      initialPropertyId && portfolio.properties.some((property) => property.id === initialPropertyId)
        ? initialPropertyId
        : "",
    [initialPropertyId, portfolio.properties]
  );
  const [state, action] = useFormState(onCreateUnit, null);
  const handledStateRef = useRef<ActionState>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<UnitDraft>({
    propertyId: getDefaultPropertyId(),
    unitNumber: "",
    bedrooms: "1",
    bathrooms: "1",
    monthlyRentDollars: ""
  });

  const requiredComplete = useMemo(
    () => Boolean(draft.propertyId && draft.unitNumber && draft.bedrooms && draft.bathrooms && draft.monthlyRentDollars),
    [draft]
  );

  const stepComplete = (step: number) => {
    if (step === 0) return Boolean(draft.propertyId);
    if (step === 1) return Boolean(draft.unitNumber);
    if (step === 2) return Boolean(draft.bedrooms);
    if (step === 3) return Boolean(draft.bathrooms);
    if (step === 4) return Boolean(draft.monthlyRentDollars);
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    if (handledStateRef.current === state) return;
    handledStateRef.current = state;
    setStepIndex(0);
    setSkippedSteps([]);
    setDraft({
      propertyId: getDefaultPropertyId(),
      unitNumber: "",
      bedrooms: "1",
      bathrooms: "1",
      monthlyRentDollars: ""
    });
    onUnitCreated?.();
  }, [getDefaultPropertyId, onUnitCreated, state]);

  useEffect(() => {
    const nextPropertyId = getDefaultPropertyId();
    if (!nextPropertyId || draft.propertyId) {
      return;
    }
    setDraft((current) => ({
      ...current,
      propertyId: nextPropertyId
    }));
  }, [draft.propertyId, getDefaultPropertyId]);

  const handleEnterAdvance = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    canAdvance: boolean,
    nextStep: number
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setStepIndex(nextStep);
  };

  const next = () => setStepIndex((current) => Math.min(current + 1, UNIT_STEP_LABELS.length - 1));
  const back = () => setStepIndex((current) => Math.max(current - 1, 0));

  const renderStep = () => {
    if (stepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 1: Pick the property this unit belongs to.</p>
          <FieldLabel htmlFor="unit-property">Property</FieldLabel>
          <Select
            id="unit-property"
            value={draft.propertyId}
            onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 1)}
            required
          >
            <option value="">Select property</option>
            {portfolio.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    if (stepIndex === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 2: Unit label. This is what tenants and staff will reference.</p>
          <FieldLabel htmlFor="unit-number" required>Unit Number</FieldLabel>
          <Input
            id="unit-number"
            value={draft.unitNumber}
            onChange={(event) => setDraft((current) => ({ ...current, unitNumber: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 2)}
            placeholder="Example: Unit 2B"
            required
          />
        </div>
      );
    }

    if (stepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: Bedrooms count.</p>
          <FieldLabel htmlFor="unit-bedrooms">Bedrooms</FieldLabel>
          <Input
            id="unit-bedrooms"
            type="number"
            min={0}
            value={draft.bedrooms}
            onChange={(event) => setDraft((current) => ({ ...current, bedrooms: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 3)}
            required
          />
        </div>
      );
    }

    if (stepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 4: Bathrooms count. Decimals are allowed.</p>
          <FieldLabel htmlFor="unit-bathrooms">Bathrooms</FieldLabel>
          <Input
            id="unit-bathrooms"
            type="number"
            min={0}
            step="0.5"
            value={draft.bathrooms}
            onChange={(event) => setDraft((current) => ({ ...current, bathrooms: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 4)}
            required
          />
        </div>
      );
    }

    if (stepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 5: Default monthly rent for this unit.</p>
          <FieldLabel htmlFor="unit-rent">Default Rent</FieldLabel>
          <Input
            id="unit-rent"
            type="number"
            min={1}
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => setDraft((current) => ({ ...current, monthlyRentDollars: event.target.value }))}
            onKeyDown={(event) => handleEnterAdvance(event, stepComplete(stepIndex), 5)}
            placeholder="Monthly rent (USD)"
            required
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and save the unit.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Property:</span> {portfolio.properties.find((property) => property.id === draft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Unit Label:</span> {draft.unitNumber || "Not set"}</p>
          <p><span className="font-semibold">Bedrooms:</span> {draft.bedrooms || "Not set"}</p>
          <p><span className="font-semibold">Bathrooms:</span> {draft.bathrooms || "Not set"}</p>
          <p><span className="font-semibold">Default Rent:</span> {draft.monthlyRentDollars ? `$${draft.monthlyRentDollars}` : "Not set"}</p>
        </div>
        {!requiredComplete && (
          <p className="text-xs text-amber-700">Required details are still missing. Complete all required steps before save.</p>
        )}
        <form className="space-y-2" action={action}>
          <input type="hidden" name="propertyId" value={draft.propertyId} />
          <input type="hidden" name="unitNumber" value={draft.unitNumber} />
          <input type="hidden" name="bedrooms" value={draft.bedrooms} />
          <input type="hidden" name="bathrooms" value={draft.bathrooms} />
          <input type="hidden" name="monthlyRentDollars" value={draft.monthlyRentDollars} />
          <SubmitButton className="w-full" title="Save this unit." disabled={!requiredComplete}>
            Save Unit
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
            <CardTitle>Add Unit</CardTitle>
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {UNIT_STEP_LABELS.map((label, index) => (
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
            disabled={stepIndex >= UNIT_STEP_LABELS.length - 1 || !stepComplete(stepIndex)}
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
            disabled={stepIndex >= UNIT_STEP_LABELS.length - 1}
            title="Skip this step for now and continue."
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
