"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { ModalOverlay } from "../ui/modal-overlay";
import { PropertyAndUnitSteps } from "./property-wizard-steps";
import { LeaseStep } from "./property-wizard-steps";
import {
  PropertyWizardSuccess, WizardProgress,
  createUnitDraft,
  createInitialLeaseDraft,
  getFirstInput,
  parseNumber,
  getPropertyStepError,
  getUnitStepError,
  getLeaseStepError,
  type PropertyType,
  type WizardStep,
  type UnitDraft,
  type LeaseDraft,
  getStepIndex,
  stepOrder,
} from "./property-wizard-drafts";
import type { ClientOverview } from "@/lib/client-overview";
import type { StatefulAction } from "./types";
import { WhoseHomeStep } from "./clients/whose-home-step";
import { cn, formatCurrency } from "@/lib/format";

export type { UnifiedSetupAction } from "./property-wizard-drafts";
import type { UnifiedSetupAction } from "./property-wizard-drafts";

interface UnifiedPropertyWizardProps {
  open: boolean;
  accountId?: string | null;
  managerClients?: ClientOverview[];
  onCreateClientAccount?: StatefulAction;
  bankConnected?: boolean;
  bankSetupHref?: string;
  onOpenChange: (open: boolean) => void;
  onCreatePropertyWithSetup?: UnifiedSetupAction;
  onComplete?: (propertyId: string | null) => void;
}

export function UnifiedPropertyWizard({
  open,
  accountId,
  managerClients,
  onCreateClientAccount,
  bankConnected,
  bankSetupHref = "/connect/onboard",
  onOpenChange,
  onCreatePropertyWithSetup,
  onComplete,
}: UnifiedPropertyWizardProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);
  const [step, setStep] = useState<WizardStep>("property");
  const [pickingClient, setPickingClient] = useState(Boolean(managerClients));
  const [selectedAccountId, setSelectedAccountId] = useState(accountId ?? "");
  const [clients, setClients] = useState(managerClients ?? []);
  const [propertyName, setPropertyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("single_family");
  const [hasMultipleUnits, setHasMultipleUnits] = useState(false);
  const [units, setUnits] = useState<UnitDraft[]>([createUnitDraft(0)]);
  const [lease, setLease] = useState<LeaseDraft>(() => createInitialLeaseDraft(""));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const initialUnit = createUnitDraft(0);
      setStep("property");
      setPickingClient(Boolean(managerClients));
      setSelectedAccountId(accountId ?? "");
      setPropertyName("");
      setAddressLine1("");
      setCity("");
      setStateCode("");
      setPostalCode("");
      setPropertyType("single_family");
      setHasMultipleUnits(false);
      setUnits([initialUnit]);
      setLease(createInitialLeaseDraft(initialUnit.id));
      setErrorMessage(null);
      setSuccessMessage(null);
      setCreatedPropertyId(null);
    }
    prevOpenRef.current = open;
  }, [accountId, managerClients, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTarget = getFirstInput(contentRef.current);
    focusTarget?.focus();
  }, [open, step]);

  useEffect(() => {
    if (propertyType !== "single_family" && !hasMultipleUnits) {
      setHasMultipleUnits(true);
    }
  }, [hasMultipleUnits, propertyType]);

  useEffect(() => {
    setUnits((current) => {
      if (hasMultipleUnits) {
        return current;
      }
      return current.length > 1 ? [current[0]] : current;
    });
  }, [hasMultipleUnits]);

  useEffect(() => {
    if (units.length === 0) {
      return;
    }

    setLease((current) => {
      const currentUnit = units.find((unit) => unit.id === current.leasedUnitId) ?? units[0];
      const nextRent = currentUnit?.monthlyRentDollars ?? "";
      return {
        ...current,
        leasedUnitId: currentUnit?.id ?? current.leasedUnitId,
        monthlyRentDollars: nextRent,
      };
    });
  }, [units]);

  const selectedLeaseUnit = useMemo(
    () => units.find((unit) => unit.id === lease.leasedUnitId) ?? units[0] ?? null,
    [lease.leasedUnitId, units],
  );

  useEffect(() => {
    if (!selectedLeaseUnit) {
      return;
    }

    setLease((current) =>
      current.leasedUnitId === selectedLeaseUnit.id &&
      current.monthlyRentDollars === selectedLeaseUnit.monthlyRentDollars
        ? current
        : {
            ...current,
            leasedUnitId: selectedLeaseUnit.id,
            monthlyRentDollars: selectedLeaseUnit.monthlyRentDollars,
          },
    );
  }, [selectedLeaseUnit]);

  const propertyStepError = getPropertyStepError({
    propertyName,
    addressLine1,
    city,
    stateCode,
    postalCode,
  });
  const unitStepError = getUnitStepError(units);
  const leaseStepError = getLeaseStepError(lease);

  const goBack = () => {
    setErrorMessage(null);
    if (managerClients && step === "property") { setPickingClient(true); return; }
    const currentIndex = getStepIndex(step);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const goNext = () => {
    setErrorMessage(null);
    if (pickingClient) { if (selectedAccountId) setPickingClient(false); return; }

    if (step === "property") {
      if (propertyStepError) {
        setErrorMessage(propertyStepError);
        return;
      }
      setStep("unit");
      return;
    }

    if (step === "unit") {
      if (unitStepError) {
        setErrorMessage(unitStepError);
        return;
      }
      setStep("lease");
      return;
    }

    if (step === "lease") {
      if (leaseStepError) {
        setErrorMessage(leaseStepError);
        return;
      }
      setStep("confirm");
    }
  };

  const handleSubmit = () => {
    if (!onCreatePropertyWithSetup) {
      setErrorMessage("This setup flow is unavailable right now.");
      return;
    }

    const payload = {
      property: {
        name: propertyName.trim(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: stateCode.trim().toUpperCase(),
        postalCode: postalCode.trim(),
        propertyType,
      },
      units: units.map((unit) => ({
        id: unit.id,
        label: unit.label.trim(),
        bedrooms: parseNumber(unit.bedrooms, 0),
        bathrooms: parseNumber(unit.bathrooms, 0),
        squareFeet: unit.squareFeet.trim() ? parseNumber(unit.squareFeet, 0) : null,
        monthlyRentDollars: parseNumber(unit.monthlyRentDollars, 0),
      })),
      lease: {
        hasTenant: lease.hasTenant,
        leasedUnitId: lease.leasedUnitId,
        tenantEmail: lease.tenantEmail.trim(),
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRentDollars: parseNumber(lease.monthlyRentDollars, 0),
        depositDollars: parseNumber(lease.depositDollars, 0),
      },
    };

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      if (selectedAccountId || accountId) {
        formData.set("accountId", selectedAccountId || accountId || "");
      }

      const result = await onCreatePropertyWithSetup(null, formData);
      if (!result?.success) {
        setErrorMessage(result?.error ?? "Domus could not finish this setup yet.");
        return;
      }

      setCreatedPropertyId(result.propertyId ?? null);
      setSuccessMessage(result.message ?? "Your property is ready.");
      setStep("success");
      toast.success(result.message ?? "Property setup complete.");
    });
  };

  const finishSetup = () => {
    onOpenChange(false);
    router.refresh();
    onComplete?.(createdPropertyId);
  };

  const summaryItems = units.map((unit) => ({
    ...unit,
    monthlyRentCents: Math.round(parseNumber(unit.monthlyRentDollars, 0) * 100),
  }));

  return (
    <ModalOverlay open={open} onClose={() => onOpenChange(false)}>
      <div className={[
          "flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem]",
          "border border-border bg-background shadow-2xl sm:max-h-[85vh] sm:rounded-[28px]"
        ].join(" ")}>
        <div className="shrink-0 border-b border-border/60 px-4 pb-0 pt-5 sm:px-6 sm:pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {managerClients ? "Add a home" : "New Property"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            {pickingClient ? "Whose home is this?" : "Set up the property, units, lease, and tenant in one flow"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            One pass. No cleanup. Domus creates the records only after you confirm the full setup.
          </p>
          {step !== "success" ? (
            <div className="py-5">
              {pickingClient ? <p className="text-sm text-[var(--muted)]">Step 1 of 5</p> : <WizardProgress step={step} />}
            </div>
          ) : null}
        </div>

        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-5 sm:px-6 sm:pb-6"
        >
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
          {successMessage && step === "success" ? (
            <Alert variant="success">{successMessage}</Alert>
          ) : null}

          {pickingClient && onCreateClientAccount ? <WhoseHomeStep clients={clients}
            selectedId={selectedAccountId} onSelect={setSelectedAccountId}
            onCreateClientAccount={onCreateClientAccount}
            onClientAdded={(client) => setClients((current) => [...current, client])} /> : null}
          {!pickingClient && <PropertyAndUnitSteps
            step={step}
            propertyName={propertyName}
            setPropertyName={setPropertyName}
            addressLine1={addressLine1}
            setAddressLine1={setAddressLine1}
            city={city}
            setCity={setCity}
            stateCode={stateCode}
            setStateCode={setStateCode}
            postalCode={postalCode}
            setPostalCode={setPostalCode}
            propertyType={propertyType}
            setPropertyType={setPropertyType}
            hasMultipleUnits={hasMultipleUnits}
            setHasMultipleUnits={setHasMultipleUnits}
            units={units}
            setUnits={setUnits}
            goNext={goNext}
          />}

          {!pickingClient && <LeaseStep step={step} lease={lease} setLease={setLease} units={units} goNext={goNext} />}

          {!pickingClient && step === "confirm" ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Confirm everything</h3>
                  <p className="text-sm text-muted-foreground">
                    Review the setup once. Domus will create everything in one submission.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="domus-card space-y-4 px-5 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Property
                    </p>
                    <h4 className="mt-2 text-xl font-semibold text-foreground">{propertyName}</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {addressLine1}, {city}, {stateCode.toUpperCase()} {postalCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Units
                    </p>
                    <div className="mt-3 space-y-3">
                      {summaryItems.map((unit) => (
                        <div
                          key={unit.id}
                          className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-foreground">{unit.label}</p>
                            <p className="text-sm font-medium text-foreground">
                              {formatCurrency(unit.monthlyRentCents)}
                            </p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {unit.bedrooms} bd • {unit.bathrooms} ba
                            {unit.squareFeet ? ` • ${unit.squareFeet} sq ft` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="domus-card space-y-4 px-5 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Lease
                    </p>
                    {lease.hasTenant ? (
                      <>
                        <h4 className="mt-2 text-xl font-semibold text-foreground">
                          {lease.tenantEmail || "Tenant invite pending"}
                        </h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedLeaseUnit?.label ?? "Selected unit"} • {lease.startDate} to{" "}
                          {lease.endDate}
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Rent{" "}
                          {formatCurrency(
                            Math.round(parseNumber(lease.monthlyRentDollars, 0) * 100),
                          )}
                          {parseNumber(lease.depositDollars, 0) > 0
                            ? ` • Deposit ${formatCurrency(Math.round(parseNumber(lease.depositDollars, 0) * 100))}`
                            : " • No deposit recorded"}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        No tenant yet. Domus will stop after creating the property and unit shell.
                      </p>
                    )}
                  </div>
                  <div className={[
                    "rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4",
                    "text-sm leading-6 text-muted-foreground"
                  ].join(" ")}>
                    Closing this wizard now will discard the draft. Nothing is saved until you click{" "}
                    <span className="font-semibold text-foreground">Create Everything</span>.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <PropertyWizardSuccess
            step={step}
            bankConnected={bankConnected}
            bankSetupHref={bankSetupHref}
            finishSetup={finishSetup}
          />
        </div>

        {step !== "success" ? (
          <div className="shrink-0 border-t border-border/60 px-4 py-4 sm:px-6">
            <div
              className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
                step === "property" && "sm:justify-end",
              )}
            >
              {step !== "property" || (managerClients && !pickingClient) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  title="Go back to the previous setup step."
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <div />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  title="Close this wizard without saving anything."
                  className="w-full sm:w-auto"
                >
                  Close
                </Button>
                {!pickingClient && step === "confirm" ? (
                  <Button
                    type="button"
                    loading={isPending}
                    onClick={handleSubmit}
                    title="Create the property, units, lease, and tenant invitation in one submission."
                    className="w-full sm:w-auto"
                  >
                    Create Everything
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={goNext}
                    disabled={pickingClient && !selectedAccountId}
                    title="Continue to the next step."
                    className="w-full sm:w-auto"
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalOverlay>
  );
}
