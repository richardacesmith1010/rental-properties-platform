"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { formatDate } from "@/lib/format";
import type { LeaseListItem, PropertyListItem, TenantOption, UnitListItem } from "@/lib/portfolio";
import {
  LEASE_WIZARD_STEP_TITLES,
  createDefaultLeaseWizardDraft,
  getEffectiveLeaseEndDate,
  getLeaseWizardStepError,
  getTenantsForProperty,
  getVacantUnitsForProperty,
  type LeaseWizardDraft,
  type LeaseWizardStep
} from "./lease-wizard-support";
import {
  LeaseWizardProgress,
  LeaseWizardStepOne,
  LeaseWizardStepThree,
  LeaseWizardStepTwo
} from "./lease-wizard-steps";

function LeaseWizardReview({
  draft,
  property,
  unit,
  tenant,
  effectiveEndDate
}: {
  draft: LeaseWizardDraft;
  property: PropertyListItem | null;
  unit: UnitListItem | null;
  tenant: TenantOption | null;
  effectiveEndDate: string;
}) {
  const tenantLabel =
    draft.tenantMode === "existing"
      ? tenant
        ? `${tenant.fullName} (${tenant.email})`
        : "Not selected"
      : `${draft.tenantFullName || "New tenant"} (${draft.tenantEmail || "email not set"})`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Property</p>
            <p className="mt-2 font-medium text-foreground">
              {property ? `${property.name} - ${property.addressLine1}` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unit</p>
            <p className="mt-2 font-medium text-foreground">
              {unit ? `${unit.unitNumber} (${unit.bedrooms} bd / ${unit.bathrooms} ba)` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tenant</p>
            <p className="mt-2 font-medium text-foreground">{tenantLabel}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Lease term</p>
            <p className="mt-2 font-medium text-foreground">
              {draft.startDate ? formatDate(draft.startDate) : "Not set"}
              {draft.startDate ? " to " : ""}
              {effectiveEndDate ? formatDate(effectiveEndDate) : "Not set"}
              {draft.leaseType === "month_to_month" ? " (month-to-month)" : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rent</p>
            <p className="mt-2 font-medium text-foreground">
              {draft.monthlyRentDollars ? `$${Number(draft.monthlyRentDollars).toFixed(2)}/month` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deposit</p>
            <p className="mt-2 font-medium text-foreground">
              ${Number(draft.depositDollars || "0").toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { LeaseWizardDraft } from "./lease-wizard-support";
export { getLeaseWizardStepError } from "./lease-wizard-support";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface LeaseWizardProps {
  open: boolean;
  properties: PropertyListItem[];
  units: UnitListItem[];
  leases: LeaseListItem[];
  tenants: TenantOption[];
  selectedPropertyId?: string | null;
  onOpenChange: (open: boolean) => void;
  onCreateLease: StatefulAction;
  onInviteTenant?: StatefulAction;
  onOpenSection: (sectionId: string) => void;
}

export function LeaseWizard({
  open,
  properties,
  units,
  leases,
  tenants,
  selectedPropertyId,
  onOpenChange,
  onCreateLease,
  onInviteTenant,
  onOpenSection
}: LeaseWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<LeaseWizardStep>(0);
  const [draft, setDraft] = useState<LeaseWizardDraft>(() =>
    createDefaultLeaseWizardDraft({ properties, units, leases, selectedPropertyId })
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const prevOpenRef = useRef(false);
  const propertiesRef = useRef(properties);
  const unitsRef = useRef(units);
  const leasesRef = useRef(leases);
  propertiesRef.current = properties;
  unitsRef.current = units;
  leasesRef.current = leases;

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setStep(0);
      setDraft(
        createDefaultLeaseWizardDraft({
          properties: propertiesRef.current,
          units: unitsRef.current,
          leases: leasesRef.current,
          selectedPropertyId
        })
      );
      setErrorMessage(null);
    }
    prevOpenRef.current = open;
    // Reset only on closed -> open transitions so parent refreshes do not blow away wizard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPropertyId]);

  const availableUnits = useMemo(
    () => getVacantUnitsForProperty(units, leases, draft.propertyId),
    [draft.propertyId, leases, units]
  );
  const availableTenants = useMemo(
    () => getTenantsForProperty(tenants, draft.propertyId),
    [draft.propertyId, tenants]
  );
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === draft.propertyId) ?? null,
    [draft.propertyId, properties]
  );
  const selectedUnit = useMemo(
    () => availableUnits.find((unit) => unit.id === draft.unitId) ?? null,
    [availableUnits, draft.unitId]
  );
  const selectedTenant = useMemo(
    () => availableTenants.find((tenant) => tenant.id === draft.tenantProfileId) ?? null,
    [availableTenants, draft.tenantProfileId]
  );
  const effectiveEndDate = useMemo(() => getEffectiveLeaseEndDate(draft), [draft]);
  const currentStepError = getLeaseWizardStepError({
    step,
    draft,
    availableUnits: availableUnits.length
  });

  const handlePropertyChange = (propertyId: string) => {
    const propertyUnits = getVacantUnitsForProperty(units, leases, propertyId);
    const propertyTenants = getTenantsForProperty(tenants, propertyId);

    setDraft((current) => ({
      ...current,
      propertyId,
      unitId: propertyUnits.some((unit) => unit.id === current.unitId)
        ? current.unitId
        : propertyUnits[0]?.id ?? "",
      tenantProfileId: propertyTenants.some((tenant) => tenant.id === current.tenantProfileId)
        ? current.tenantProfileId
        : "",
      tenantSearch: ""
    }));
    setErrorMessage(null);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleCreateLease = () => {
    const validationError =
      getLeaseWizardStepError({ step: 0, draft, availableUnits: availableUnits.length }) ??
      getLeaseWizardStepError({ step: 1, draft, availableUnits: availableUnits.length }) ??
      getLeaseWizardStepError({ step: 2, draft, availableUnits: availableUnits.length });

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      let tenantProfileId = draft.tenantProfileId;

      if (draft.tenantMode === "invite_new") {
        if (!onInviteTenant) {
          setErrorMessage("Tenant invitations are unavailable for this workspace.");
          return;
        }

        const inviteFormData = new FormData();
        inviteFormData.set("propertyId", draft.propertyId);
        inviteFormData.set("unitId", draft.unitId);
        inviteFormData.set("fullName", draft.tenantFullName.trim());
        inviteFormData.set("email", draft.tenantEmail.trim());
        inviteFormData.set("monthlyRentDollars", draft.monthlyRentDollars.trim());
        inviteFormData.set("leaseStartDate", draft.startDate);
        inviteFormData.set("leaseEndDate", effectiveEndDate);

        const inviteResult = await onInviteTenant(null, inviteFormData);
        if (!inviteResult?.success) {
          setErrorMessage(inviteResult?.error ?? "Unable to invite this tenant right now.");
          return;
        }

        tenantProfileId = inviteResult.tenantProfileId ?? "";
        if (!tenantProfileId) {
          setErrorMessage(
            "Invitation sent, but Domus could not recover the tenant profile immediately. Finish the lease after the tenant accepts the invitation."
          );
          return;
        }
      }

      const leaseFormData = new FormData();
      leaseFormData.set("unitId", draft.unitId);
      leaseFormData.set("tenantProfileId", tenantProfileId);
      leaseFormData.set("startDate", draft.startDate);
      leaseFormData.set("endDate", effectiveEndDate);
      leaseFormData.set("dueDayOfMonth", draft.dueDayOfMonth || "1");
      leaseFormData.set("monthlyRentDollars", draft.monthlyRentDollars.trim());
      leaseFormData.set("depositDollars", draft.depositDollars.trim() || "0");
      leaseFormData.set("gracePeriodDays", draft.gracePeriodDays.trim() || "5");
      leaseFormData.set("lateFeeDollars", draft.lateFeeDollars.trim() || "0");

      const createResult = await onCreateLease(null, leaseFormData);
      if (!createResult?.success) {
        setErrorMessage(createResult?.error ?? "Unable to create this lease right now.");
        return;
      }

      toast.success(
        draft.tenantMode === "invite_new"
          ? "Tenant invited and lease created."
          : createResult.message ?? "Lease created."
      );
      onOpenChange(false);
      onOpenSection("leases");
      router.refresh();
    });
  };

  const handleNext = () => {
    if (step === LEASE_WIZARD_STEP_TITLES.length - 1) {
      handleCreateLease();
      return;
    }

    if (currentStepError) {
      setErrorMessage(currentStepError);
      return;
    }

    setErrorMessage(null);
    setStep((current) => (current + 1) as LeaseWizardStep);
  };

  return (
    <ModalOverlay open={open} onClose={handleClose}>
      <div className="flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] border border-border bg-card px-4 pb-4 pt-5 shadow-2xl sm:rounded-[28px] sm:p-8">
        <div className="shrink-0 flex flex-col gap-4 border-b border-border pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Lease Creation Wizard
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">Create a lease without leaving the dashboard</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Pick the home, set the terms, attach a tenant, and create the lease in one guided flow.
              </p>
            </div>
            <DomMascot size="lg" mood="thinking" animate className="self-center sm:self-start" />
          </div>
          <LeaseWizardProgress step={step} />
        </div>

        <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 scroll-smooth [-webkit-overflow-scrolling:touch]">
          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {step === 0 ? (
            <LeaseWizardStepOne
              properties={properties}
              availableUnits={availableUnits}
              draft={draft}
              onPropertyChange={handlePropertyChange}
              onUnitChange={(unitId) => setDraft((current) => ({ ...current, unitId }))}
            />
          ) : null}

          {step === 1 ? (
            <LeaseWizardStepTwo draft={draft} onDraftChange={setDraft} />
          ) : null}

          {step === 2 ? (
            <LeaseWizardStepThree
              draft={draft}
              tenants={availableTenants}
              onDraftChange={setDraft}
            />
          ) : null}

          {step === 3 ? (
            <LeaseWizardReview
              draft={draft}
              property={selectedProperty}
              unit={selectedUnit}
              tenant={selectedTenant}
              effectiveEndDate={effectiveEndDate}
            />
          ) : null}
        </div>

        <div className="mt-8 flex shrink-0 flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || isPending}
            onClick={() => setStep((current) => Math.max(0, current - 1) as LeaseWizardStep)}
            title="Go back to the previous lease setup step."
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={isPending}
              title="Close the lease creation wizard."
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleNext}
              className="w-full sm:w-auto"
              title={
                step === LEASE_WIZARD_STEP_TITLES.length - 1
                  ? "Create the lease with the details above."
                  : "Continue to the next lease setup step."
              }
            >
              {step === LEASE_WIZARD_STEP_TITLES.length - 1 ? (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Create Lease
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
