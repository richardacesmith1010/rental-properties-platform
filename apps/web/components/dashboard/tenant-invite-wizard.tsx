"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import type { PropertyListItem, UnitListItem } from "@/lib/portfolio";
import {
  STEP_TITLES,
  TenantInviteStepOne,
  TenantInviteStepThree,
  TenantInviteStepTwo,
  TenantInviteSuccess,
  TenantInviteWizardProgress,
  createDefaultDraft,
  getTenantInviteStepError,
  getUnitsForProperty,
  type TenantInviteWizardDraft,
  type WizardStep
} from "./tenant-invite-wizard-support";

export type { TenantInviteWizardDraft } from "./tenant-invite-wizard-support";
export { getTenantInviteStepError } from "./tenant-invite-wizard-support";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface TenantInviteWizardProps {
  open: boolean;
  properties: PropertyListItem[];
  units: UnitListItem[];
  onOpenChange: (open: boolean) => void;
  onInviteTenant: StatefulAction;
  onOpenSection: (sectionId: string) => void;
}

export function TenantInviteWizard({
  open,
  properties,
  units,
  onOpenChange,
  onInviteTenant,
  onOpenSection
}: TenantInviteWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [draft, setDraft] = useState<TenantInviteWizardDraft>(() => createDefaultDraft(properties, units));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sentSummary, setSentSummary] = useState<{
    propertyName: string;
    unitLabel: string;
    email: string;
    fullName: string;
  } | null>(null);
  const prevOpenRef = useRef(false);
  const propertiesRef = useRef(properties);
  const unitsRef = useRef(units);
  propertiesRef.current = properties;
  unitsRef.current = units;

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setStep(0);
      setDraft(createDefaultDraft(propertiesRef.current, unitsRef.current));
      setErrorMessage(null);
      setSuccessMessage(null);
      setSentSummary(null);
    }
    prevOpenRef.current = open;
    // Reset only when the wizard transitions from closed to open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const availableUnits = useMemo(
    () => getUnitsForProperty(units, draft.propertyId),
    [draft.propertyId, units]
  );
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === draft.propertyId) ?? null,
    [draft.propertyId, properties]
  );
  const selectedUnit = useMemo(
    () => availableUnits.find((unit) => unit.id === draft.unitId) ?? null,
    [availableUnits, draft.unitId]
  );
  const currentStepError = getTenantInviteStepError({ step, draft, availableUnits: availableUnits.length });
  const canGoBack = step > 0 && step < STEP_TITLES.length - 1;

  const handlePropertyChange = (propertyId: string) => {
    const propertyUnits = getUnitsForProperty(units, propertyId);
    setDraft((current) => ({
      ...current,
      propertyId,
      unitId: propertyUnits.some((unit) => unit.id === current.unitId)
        ? current.unitId
        : propertyUnits[0]?.id ?? ""
    }));
    setErrorMessage(null);
  };

  const handleCloseToDashboard = () => {
    onOpenChange(false);
    router.refresh();
    onOpenSection("portfolio");
  };

  const handleSendInvite = (skipOptionalLeaseDetails = false) => {
    const validationError =
      getTenantInviteStepError({ step: 0, draft, availableUnits: availableUnits.length }) ??
      getTenantInviteStepError({ step: 1, draft, availableUnits: availableUnits.length });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      const formData = new FormData();
      formData.set("propertyId", draft.propertyId);
      formData.set("unitId", draft.unitId);
      formData.set("fullName", draft.fullName);
      formData.set("email", draft.email);
      if (draft.phone.trim()) {
        formData.set("phone", draft.phone.trim());
      }
      if (!skipOptionalLeaseDetails) {
        if (draft.monthlyRentDollars.trim()) {
          formData.set("monthlyRentDollars", draft.monthlyRentDollars.trim());
        }
        if (draft.leaseStartDate) {
          formData.set("leaseStartDate", draft.leaseStartDate);
        }
        if (draft.leaseEndDate) {
          formData.set("leaseEndDate", draft.leaseEndDate);
        }
      }

      const result = await onInviteTenant(null, formData);
      if (!result?.success) {
        setErrorMessage(result?.error ?? "Unable to send this invitation right now.");
        return;
      }

      setSuccessMessage(result.message ?? "Invitation sent.");
      setSentSummary({
        propertyName: selectedProperty?.name ?? "Property",
        unitLabel: selectedUnit?.unitNumber ?? "Unit",
        email: draft.email,
        fullName: draft.fullName
      });
      setStep(3);
    });
  };

  const handleNext = () => {
    if (step === 2) {
      handleSendInvite(false);
      return;
    }

    if (step === 3) {
      handleCloseToDashboard();
      return;
    }

    if (currentStepError) {
      setErrorMessage(currentStepError);
      return;
    }

    setErrorMessage(null);
    setStep((current) => (current + 1) as WizardStep);
  };

  const handleInviteAnother = () => {
    setStep(0);
    setDraft(createDefaultDraft(properties, units));
    setErrorMessage(null);
    setSuccessMessage(null);
    setSentSummary(null);
  };

  return (
    <ModalOverlay open={open} onClose={() => onOpenChange(false)}>
      <div className="flex max-h-[90svh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.5rem] border border-border bg-card px-4 pb-4 pt-5 shadow-2xl sm:rounded-[28px] sm:p-8">
        <div className="shrink-0 flex flex-col gap-4 border-b border-border pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tenant Invite Wizard
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">Invite a tenant with context</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Pick the home, add tenant details, optionally include rent context, and Domus will send a branded invitation.
              </p>
            </div>
            <DomMascot size="lg" mood="waving" animate className="self-center sm:self-start" />
          </div>
          <TenantInviteWizardProgress step={step} />
        </div>

        <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 scroll-smooth [-webkit-overflow-scrolling:touch]">
          {errorMessage ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
          {step === 0 ? (
            <TenantInviteStepOne
              properties={properties}
              availableUnits={availableUnits}
              draft={draft}
              onPropertyChange={handlePropertyChange}
              onUnitChange={(unitId) => setDraft((current) => ({ ...current, unitId }))}
            />
          ) : null}
          {step === 1 ? (
            <TenantInviteStepTwo draft={draft} onDraftChange={setDraft} />
          ) : null}
          {step === 2 ? (
            <TenantInviteStepThree draft={draft} onDraftChange={setDraft} />
          ) : null}
          {step === 3 && sentSummary ? (
            <TenantInviteSuccess summary={sentSummary} successMessage={successMessage} />
          ) : null}
        </div>

        <div className="mt-8 flex shrink-0 flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={!canGoBack || isPending}
            onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
            title="Go back to the previous tenant invite step."
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:items-center">
            {step === 2 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => handleSendInvite(true)}
                title="Skip rent and lease details for now, then send the invitation."
                className="w-full sm:w-auto"
              >
                Skip - I&apos;ll set this up later
              </Button>
            ) : null}

            {step === 3 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInviteAnother}
                  title="Reset the wizard and invite another tenant."
                  className="w-full sm:w-auto"
                >
                  Invite Another Tenant
                </Button>
                <Button type="button" onClick={handleCloseToDashboard} title="Close the wizard and return to the dashboard." className="w-full sm:w-auto">
                  Back to Dashboard
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} title="Close the tenant invite wizard." className="w-full sm:w-auto">
                  Close
                </Button>
                <Button type="button" disabled={isPending} onClick={handleNext} title={step === 2 ? "Send the invitation." : "Continue to the next step."} className="w-full sm:w-auto">
                  {step === 2 ? "Send Invitation" : "Next"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
