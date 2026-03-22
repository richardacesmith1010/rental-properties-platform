"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { PortfolioData } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FieldLabel, FormError, FormSuccess } from "./form-helpers";

interface LeaseDraft {
  propertyId: string;
  unitId: string;
  tenantProfileId: string;
  startDate: string;
  endDate: string;
  dueDayOfMonth: string;
  monthlyRentDollars: string;
  depositDollars: string;
  gracePeriodDays: string;
  lateFeeDollars: string;
}

const LEASE_STEP_LABELS = [
  "Pick Property",
  "Pick Unit",
  "Pick Tenant",
  "Set Lease Dates",
  "Set Billing Terms",
  "Review & Save"
] as const;

interface LeaseFormProps {
  portfolio: PortfolioData;
  onCreateLease: StatefulAction;
  onLeaseCreated?: () => void;
  onBack: () => void;
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

export function LeaseForm({ portfolio, onCreateLease, onLeaseCreated, onBack }: LeaseFormProps) {
  const [state, action] = useFormState(onCreateLease, null);
  const handledStateRef = useRef<ActionState>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<LeaseDraft>({
    propertyId: "",
    unitId: "",
    tenantProfileId: "",
    startDate: "",
    endDate: "",
    dueDayOfMonth: "1",
    monthlyRentDollars: "",
    depositDollars: "0",
    gracePeriodDays: "5",
    lateFeeDollars: ""
  });
  const [lateFeeTouched, setLateFeeTouched] = useState(false);

  const unitsForSelectedProperty = useMemo(
    () => portfolio.units.filter((unit) => !draft.propertyId || unit.propertyId === draft.propertyId),
    [draft.propertyId, portfolio.units]
  );

  const tenantsForSelectedProperty = useMemo(
    () =>
      portfolio.tenants.filter(
        (tenant) => !draft.propertyId || tenant.propertyIds.includes(draft.propertyId)
      ),
    [draft.propertyId, portfolio.tenants]
  );

  const requiredComplete = useMemo(
    () => Boolean(draft.unitId && draft.tenantProfileId && draft.startDate && draft.endDate && draft.dueDayOfMonth && draft.monthlyRentDollars && draft.propertyId),
    [draft]
  );

  const stepComplete = (step: number) => {
    if (step === 0) return Boolean(draft.propertyId);
    if (step === 1) return Boolean(draft.unitId);
    if (step === 2) return Boolean(draft.tenantProfileId);
    if (step === 3) return Boolean(draft.startDate && draft.endDate);
    if (step === 4) return Boolean(draft.dueDayOfMonth && draft.monthlyRentDollars);
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    if (handledStateRef.current === state) return;
    handledStateRef.current = state;
    setStepIndex(0);
    setSkippedSteps([]);
    setLateFeeTouched(false);
    setDraft({
      propertyId: "",
      unitId: "",
      tenantProfileId: "",
      startDate: "",
      endDate: "",
      dueDayOfMonth: "1",
      monthlyRentDollars: "",
      depositDollars: "0",
      gracePeriodDays: "5",
      lateFeeDollars: ""
    });
    onLeaseCreated?.();
  }, [onLeaseCreated, state]);

  const suggestedLateFeeDollars = useMemo(() => {
    const monthlyRent = Number(draft.monthlyRentDollars);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return "0.00";
    }

    return (monthlyRent * 0.05).toFixed(2);
  }, [draft.monthlyRentDollars]);

  const effectiveLateFeeDollars = lateFeeTouched ? draft.lateFeeDollars : suggestedLateFeeDollars;
  const next = () => setStepIndex((current) => Math.min(current + 1, LEASE_STEP_LABELS.length - 1));
  const back = () => setStepIndex((current) => Math.max(current - 1, 0));

  const renderStep = () => {
    if (stepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 1: Select the property first. Everything else depends on this.</p>
          <FieldLabel htmlFor="lease-property">Property</FieldLabel>
          <Select
            id="lease-property"
            value={draft.propertyId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                propertyId: event.target.value,
                unitId: "",
                tenantProfileId: ""
              }))
            }
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
          <p className="text-sm text-zinc-600">Step 2: Select the unit for this lease.</p>
          <FieldLabel htmlFor="lease-unit" required>Unit</FieldLabel>
          <Select
            id="lease-unit"
            value={draft.unitId}
            onChange={(event) => setDraft((current) => ({ ...current, unitId: event.target.value }))}
            required
            disabled={!draft.propertyId}
          >
            <option value="">Select unit</option>
            {unitsForSelectedProperty.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} • {unit.unitNumber}
              </option>
            ))}
          </Select>
          {!draft.propertyId && <p className="text-xs text-amber-700">Pick a property first.</p>}
        </div>
      );
    }

    if (stepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: Select a tenant linked to this property.</p>
          <FieldLabel htmlFor="lease-tenant" required>Tenant</FieldLabel>
          <Select
            id="lease-tenant"
            value={draft.tenantProfileId}
            onChange={(event) => setDraft((current) => ({ ...current, tenantProfileId: event.target.value }))}
            required
            disabled={!draft.propertyId}
          >
            <option value="">Select tenant</option>
            {tenantsForSelectedProperty.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.fullName} ({tenant.email})
              </option>
            ))}
          </Select>
          {draft.propertyId && tenantsForSelectedProperty.length === 0 && (
            <p className="text-xs text-amber-700">No tenants are linked to this property yet. Invite a tenant first.</p>
          )}
        </div>
      );
    }

    if (stepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 4: Enter lease start and end dates.</p>
          <FieldLabel htmlFor="lease-start-date" required>Start Date</FieldLabel>
          <Input
            id="lease-start-date"
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
            required
          />
          <FieldLabel htmlFor="lease-end-date" required>End Date</FieldLabel>
          <Input
            id="lease-end-date"
            type="date"
            value={draft.endDate}
            onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
            required
          />
        </div>
      );
    }

    if (stepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 5: Enter billing terms.</p>
          <FieldLabel htmlFor="lease-due-day">Due Day of Month</FieldLabel>
          <Input
            id="lease-due-day"
            type="number"
            min={1}
            max={28}
            value={draft.dueDayOfMonth}
            onChange={(event) => setDraft((current) => ({ ...current, dueDayOfMonth: event.target.value }))}
            required
            placeholder="Due day of month"
          />
          <FieldLabel htmlFor="lease-rent" required>Monthly Rent</FieldLabel>
          <Input
            id="lease-rent"
            type="number"
            min={1}
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => setDraft((current) => ({ ...current, monthlyRentDollars: event.target.value }))}
            required
            placeholder="Monthly rent (USD)"
          />
          <FieldLabel htmlFor="lease-deposit">Deposit</FieldLabel>
          <Input
            id="lease-deposit"
            type="number"
            min={0}
            step="0.01"
            value={draft.depositDollars}
            onChange={(event) => setDraft((current) => ({ ...current, depositDollars: event.target.value }))}
            placeholder="Deposit (USD)"
          />
          <FieldLabel htmlFor="lease-late-fee">Late Fee ($)</FieldLabel>
          <Input
            id="lease-late-fee"
            type="number"
            min={0}
            step="0.01"
            value={effectiveLateFeeDollars}
            onChange={(event) => {
              setLateFeeTouched(true);
              setDraft((current) => ({ ...current, lateFeeDollars: event.target.value }));
            }}
            placeholder="Suggested at 5% of monthly rent"
          />
          <FieldLabel htmlFor="lease-grace-period">Grace Period (days)</FieldLabel>
          <Input
            id="lease-grace-period"
            type="number"
            min={0}
            max={30}
            value={draft.gracePeriodDays}
            onChange={(event) => setDraft((current) => ({ ...current, gracePeriodDays: event.target.value }))}
            placeholder="Days before the late fee applies"
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and save the lease.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Property:</span> {portfolio.properties.find((property) => property.id === draft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Unit:</span> {portfolio.units.find((unit) => unit.id === draft.unitId)?.unitNumber ?? "Not set"}</p>
          <p><span className="font-semibold">Tenant:</span> {portfolio.tenants.find((tenant) => tenant.id === draft.tenantProfileId)?.email ?? "Not set"}</p>
          <p><span className="font-semibold">Dates:</span> {draft.startDate || "?"} → {draft.endDate || "?"}</p>
          <p><span className="font-semibold">Billing:</span> day {draft.dueDayOfMonth || "?"}, ${draft.monthlyRentDollars || "?"}/month</p>
          <p><span className="font-semibold">Late Fee:</span> ${effectiveLateFeeDollars || "0.00"}</p>
          <p><span className="font-semibold">Grace Period:</span> {draft.gracePeriodDays || "5"} days</p>
        </div>
        {!requiredComplete && (
          <p className="text-xs text-amber-700">You can skip steps, but lease save stays disabled until required details are completed.</p>
        )}
        <form className="space-y-2" action={action}>
          <input type="hidden" name="unitId" value={draft.unitId} />
          <input type="hidden" name="tenantProfileId" value={draft.tenantProfileId} />
          <input type="hidden" name="startDate" value={draft.startDate} />
          <input type="hidden" name="endDate" value={draft.endDate} />
          <input type="hidden" name="dueDayOfMonth" value={draft.dueDayOfMonth} />
          <input type="hidden" name="monthlyRentDollars" value={draft.monthlyRentDollars} />
          <input type="hidden" name="depositDollars" value={draft.depositDollars} />
          <input type="hidden" name="lateFeeDollars" value={effectiveLateFeeDollars} />
          <input type="hidden" name="gracePeriodDays" value={draft.gracePeriodDays} />
          <SubmitButton className="w-full" title="Save this lease with the details above." disabled={!requiredComplete}>
            Save Lease
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
            <CardTitle>Create Lease</CardTitle>
            <p className="text-xs text-zinc-500">One step at a time. Final save requires all required details.</p>
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
          {LEASE_STEP_LABELS.map((label, index) => (
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
            disabled={stepIndex >= LEASE_STEP_LABELS.length - 1 || !stepComplete(stepIndex)}
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
            disabled={stepIndex >= LEASE_STEP_LABELS.length - 1}
            title="Skip this step for now and continue."
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
