"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { PortfolioData } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, FormSuccess } from "./form-helpers";
import { LeaseFormStep } from "./lease-form-step";
import type { LeaseDraft } from "./lease-form-draft";


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
  onCreatePropertyAction?: () => void;
  onAddUnitAction?: (propertyId: string) => void;
  onInviteTenantAction?: () => void;
}

function StepPill({ label, active, done, skipped }: { label: string; active: boolean; done: boolean; skipped: boolean }) {
  const className = active
    ? "border-[var(--accent-line)] bg-[var(--accent-weak)] text-[var(--accent)]"
    : done
      ? "border-[var(--pos)] bg-[var(--pos-bg)] text-[var(--pos)]"
      : skipped
        ? "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)]"
        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]";

  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function LeaseForm({
  portfolio,
  onCreateLease,
  onLeaseCreated,
  onBack,
  onCreatePropertyAction,
  onAddUnitAction,
  onInviteTenantAction
}: LeaseFormProps) {
  const pathname = usePathname();
  const router = useRouter();
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
    lateFeeDollars: "",
    collectsOutsideDomus: false
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
  const selectedProperty =
    portfolio.properties.find((property) => property.id === draft.propertyId) ?? null;
  const hasNoProperties = portfolio.properties.length === 0;
  const hasNoUnitsForSelectedProperty = Boolean(draft.propertyId && unitsForSelectedProperty.length === 0);
  const hasNoTenantsForSelectedProperty = Boolean(
    draft.propertyId && draft.unitId && tenantsForSelectedProperty.length === 0
  );

  const requiredComplete = useMemo(
    () => Boolean(
      draft.unitId && draft.tenantProfileId && draft.startDate && draft.endDate &&
      draft.dueDayOfMonth && draft.monthlyRentDollars && draft.propertyId
    ),
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
      lateFeeDollars: "",
      collectsOutsideDomus: false
    });
    onLeaseCreated?.();
  }, [onLeaseCreated, state]);

  useEffect(() => {
    if (draft.propertyId || portfolio.properties.length !== 1) {
      return;
    }
    setDraft((current) =>
      current.propertyId
        ? current
        : { ...current, propertyId: portfolio.properties[0]?.id ?? "" }
    );
  }, [draft.propertyId, portfolio.properties]);

  useEffect(() => {
    if (!draft.propertyId || draft.unitId || unitsForSelectedProperty.length !== 1) {
      return;
    }
    setDraft((current) =>
      current.unitId
        ? current
        : { ...current, unitId: unitsForSelectedProperty[0]?.id ?? "" }
    );
  }, [draft.propertyId, draft.unitId, unitsForSelectedProperty]);

  useEffect(() => {
    if (!draft.propertyId || draft.tenantProfileId || tenantsForSelectedProperty.length !== 1) {
      return;
    }
    setDraft((current) =>
      current.tenantProfileId
        ? current
        : { ...current, tenantProfileId: tenantsForSelectedProperty[0]?.id ?? "" }
    );
  }, [draft.propertyId, draft.tenantProfileId, tenantsForSelectedProperty]);

  const suggestedLateFeeDollars = useMemo(() => {
    const monthlyRent = Number(draft.monthlyRentDollars);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return "0.00";
    }

    return (monthlyRent * 0.05).toFixed(2);
  }, [draft.monthlyRentDollars]);

  const effectiveLateFeeDollars = lateFeeTouched ? draft.lateFeeDollars : suggestedLateFeeDollars;
  const navigateAfterLeave = (callback: () => void) => {
    onBack();
    window.setTimeout(callback, 0);
  };
  const handleCreateProperty = () => {
    if (onCreatePropertyAction) {
      navigateAfterLeave(onCreatePropertyAction);
      return;
    }
    navigateAfterLeave(() => router.push(`${pathname}?section=operations`));
  };
  const handleAddUnit = () => {
    if (onAddUnitAction && draft.propertyId) {
      navigateAfterLeave(() => onAddUnitAction(draft.propertyId));
      return;
    }
    const propertyParam = draft.propertyId ? `&property=${encodeURIComponent(draft.propertyId)}` : "";
    navigateAfterLeave(() => router.push(`${pathname}?section=operations${propertyParam}`));
  };
  const handleInviteTenant = () => {
    if (onInviteTenantAction) {
      navigateAfterLeave(onInviteTenantAction);
      return;
    }
    navigateAfterLeave(() => router.push(`${pathname}?section=invitations`));
  };
  const next = () => setStepIndex((current) => Math.min(current + 1, LEASE_STEP_LABELS.length - 1));
  const back = () => setStepIndex((current) => Math.max(current - 1, 0));
  const isStepBlockedByEmptyState =
    (stepIndex === 0 && hasNoProperties) ||
    (stepIndex === 1 && hasNoUnitsForSelectedProperty) ||
    (stepIndex === 2 && hasNoTenantsForSelectedProperty);

  const stepContent = (
    <LeaseFormStep
      stepIndex={stepIndex}
      portfolio={portfolio}
      draft={draft}
      setDraft={setDraft}
      unitsForSelectedProperty={unitsForSelectedProperty}
      tenantsForSelectedProperty={tenantsForSelectedProperty}
      selectedProperty={selectedProperty}
      hasNoProperties={hasNoProperties}
      hasNoUnitsForSelectedProperty={hasNoUnitsForSelectedProperty}
      hasNoTenantsForSelectedProperty={hasNoTenantsForSelectedProperty}
      requiredComplete={requiredComplete}
      effectiveLateFeeDollars={effectiveLateFeeDollars}
      setLateFeeTouched={setLateFeeTouched}
      handleCreateProperty={handleCreateProperty}
      handleAddUnit={handleAddUnit}
      handleInviteTenant={handleInviteTenant}
      action={action}
    />
  );

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Create Lease</CardTitle>
            <p className="text-xs text-[var(--muted)]">One step at a time. Final save requires all required details.</p>
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

        {stepContent}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={back} disabled={stepIndex === 0} title="Go back one step.">
            Back
          </Button>
          <Button
            type="button"
            onClick={next}
            disabled={
              stepIndex >= LEASE_STEP_LABELS.length - 1 ||
              !stepComplete(stepIndex) ||
              isStepBlockedByEmptyState
            }
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
            disabled={stepIndex >= LEASE_STEP_LABELS.length - 1 || isStepBlockedByEmptyState}
            title="Skip this step for now and continue."
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
