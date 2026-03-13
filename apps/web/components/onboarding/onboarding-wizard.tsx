"use client";

import { useCallback, useMemo, useState } from "react";
import type { ActionState } from "@/app/actions";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { AddUnitStep } from "./steps/add-unit-step";
import { AddLeaseStep } from "./steps/add-lease-step";
import { InviteTenantStep } from "./steps/invite-tenant-step";
import { ConnectBankStep } from "./steps/connect-bank-step";
import { CompletionStep } from "./steps/completion-step";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface OnboardingWizardProps {
  propertyId: string;
  propertyName: string;
  stripeConnected: boolean;
  unitCount: number;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onInviteTenant: StatefulAction;
}

type WizardStep = "unit" | "lease" | "invite" | "bank" | "done";

const ALL_STEPS: WizardStep[] = ["unit", "lease", "invite", "bank", "done"];

export function OnboardingWizard({
  propertyId,
  propertyName,
  stripeConnected,
  unitCount,
  onCreateUnit,
  onCreateLease,
  onInviteTenant
}: OnboardingWizardProps) {
  const shouldShow = unitCount === 0;
  const [open, setOpen] = useState(shouldShow);
  const [currentStep, setCurrentStep] = useState<WizardStep>("unit");
  const [stepsCompleted, setStepsCompleted] = useState<string[]>([]);
  const [createdUnitId, setCreatedUnitId] = useState<string | null>(null);
  const [createdRentDollars, setCreatedRentDollars] = useState(0);

  const steps = useMemo(() => {
    if (stripeConnected) {
      return ALL_STEPS.filter((s) => s !== "bank");
    }
    return ALL_STEPS;
  }, [stripeConnected]);

  const currentStepIndex = steps.indexOf(currentStep);

  const advance = useCallback(() => {
    const nextIndex = steps.indexOf(currentStep) + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  }, [currentStep, steps]);

  const handleUnitComplete = useCallback(() => {
    setStepsCompleted((prev) => [...prev, "Unit added"]);
    advance();
  }, [advance]);

  const handleLeaseComplete = useCallback(() => {
    setStepsCompleted((prev) => [...prev, "Lease created"]);
    advance();
  }, [advance]);

  const handleInviteComplete = useCallback(() => {
    setStepsCompleted((prev) => [...prev, "Tenant invited"]);
    advance();
  }, [advance]);

  const handleFinish = useCallback(() => {
    setOpen(false);
    window.location.reload();
  }, []);

  // Wrap createUnit to capture the created unit ID from response
  const wrappedCreateUnit: StatefulAction = useCallback(
    async (prev, formData) => {
      const result = await onCreateUnit(prev, formData);
      if (result?.success) {
        // Store the rent value for pre-filling the lease step
        const rentVal = formData.get("monthlyRentDollars");
        if (rentVal) {
          setCreatedRentDollars(Number(rentVal) || 0);
        }
      }
      return result;
    },
    [onCreateUnit]
  );

  if (!open) return null;

  return (
    <ModalOverlay open={open}>
      <div className="mx-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl sm:mx-0">
        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i < currentStepIndex
                    ? "bg-emerald-100 text-emerald-700"
                    : i === currentStepIndex
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {i < currentStepIndex ? "\u2713" : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 w-6 ${
                    i < currentStepIndex ? "bg-emerald-300" : "bg-zinc-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {currentStep === "unit" && (
          <AddUnitStep
            propertyId={propertyId}
            propertyName={propertyName}
            onCreateUnit={wrappedCreateUnit}
            onComplete={handleUnitComplete}
            onSkip={advance}
          />
        )}

        {currentStep === "lease" && (
          <AddLeaseStep
            unitId={createdUnitId ?? ""}
            monthlyRentDollars={createdRentDollars}
            onCreateLease={onCreateLease}
            onComplete={handleLeaseComplete}
            onSkip={advance}
          />
        )}

        {currentStep === "invite" && (
          <InviteTenantStep
            propertyId={propertyId}
            onInviteTenant={onInviteTenant}
            onComplete={handleInviteComplete}
            onSkip={advance}
          />
        )}

        {currentStep === "bank" && (
          <ConnectBankStep
            alreadyConnected={stripeConnected}
            onSkip={advance}
          />
        )}

        {currentStep === "done" && (
          <CompletionStep
            stepsCompleted={stepsCompleted}
            onFinish={handleFinish}
          />
        )}
      </div>
    </ModalOverlay>
  );
}
