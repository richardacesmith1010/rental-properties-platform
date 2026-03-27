"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Home, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/format";

export type UnifiedSetupAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

type PropertyType = "single_family" | "duplex" | "triplex" | "apartment" | "condo" | "townhouse";
type WizardStep = "property" | "unit" | "lease" | "confirm" | "success";

interface UnitDraft {
  id: string;
  label: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  monthlyRentDollars: string;
}

interface LeaseDraft {
  hasTenant: boolean;
  leasedUnitId: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRentDollars: string;
  depositDollars: string;
}

interface UnifiedPropertyWizardProps {
  open: boolean;
  accountId?: string | null;
  onOpenChange: (open: boolean) => void;
  onCreatePropertyWithSetup?: UnifiedSetupAction;
  onComplete?: (propertyId: string | null) => void;
}

const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "single_family", label: "Single Family" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "apartment", label: "Apartment" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" }
];

const stepOrder: WizardStep[] = ["property", "unit", "lease", "confirm"];

function createUnitDraft(index = 0): UnitDraft {
  return {
    id: crypto.randomUUID(),
    label: `Unit ${String.fromCharCode(65 + index)}`,
    bedrooms: "1",
    bathrooms: "1",
    squareFeet: "",
    monthlyRentDollars: ""
  };
}

function createInitialLeaseDraft(unitId: string): LeaseDraft {
  return {
    hasTenant: false,
    leasedUnitId: unitId,
    tenantEmail: "",
    startDate: "",
    endDate: "",
    monthlyRentDollars: "",
    depositDollars: "0"
  };
}

function getStepIndex(step: WizardStep) {
  return Math.max(0, stepOrder.indexOf(step));
}

function getFirstInput(container: HTMLDivElement | null) {
  return container?.querySelector<HTMLElement>("[data-autofocus='true']") ?? null;
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shouldAdvanceOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.shiftKey) {
    return false;
  }

  const target = event.target as HTMLElement | null;
  const tagName = target?.tagName ?? "";
  return tagName !== "TEXTAREA" && tagName !== "BUTTON" && tagName !== "SELECT";
}

function getPropertyStepError(params: {
  propertyName: string;
  addressLine1: string;
  city: string;
  stateCode: string;
  postalCode: string;
}) {
  if (!params.propertyName.trim()) return "Property name is required.";
  if (!params.addressLine1.trim()) return "Street address is required.";
  if (!params.city.trim()) return "City is required.";
  if (!params.stateCode.trim()) return "State is required.";
  if (!/^\d{5}(-\d{4})?$/.test(params.postalCode.trim())) return "Enter a valid 5-digit ZIP code.";
  return null;
}

function getUnitStepError(units: UnitDraft[]) {
  if (units.length === 0) {
    return "Add at least one unit.";
  }

  for (const unit of units) {
    if (!unit.label.trim()) return "Each unit needs a label.";
    if (parseNumber(unit.bedrooms, -1) < 0) return "Bedrooms must be 0 or more.";
    if (parseNumber(unit.bathrooms, -1) < 0) return "Bathrooms must be 0 or more.";
    if (parseNumber(unit.monthlyRentDollars, 0) <= 0) return "Each unit needs a monthly rent amount.";
  }

  return null;
}

function getLeaseStepError(lease: LeaseDraft) {
  if (!lease.hasTenant) {
    return null;
  }

  if (!lease.tenantEmail.trim()) return "Tenant email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lease.tenantEmail.trim())) return "Enter a valid tenant email.";
  if (!lease.startDate) return "Lease start date is required.";
  if (!lease.endDate) return "Lease end date is required.";
  if (lease.endDate <= lease.startDate) return "End date must be after start date.";
  if (parseNumber(lease.monthlyRentDollars, 0) <= 0) return "Monthly rent must be greater than $0.";
  if (parseNumber(lease.depositDollars, 0) < 0) return "Deposit cannot be negative.";
  return null;
}

function WizardProgress({ step }: { step: WizardStep }) {
  const current = getStepIndex(step) + 1;
  const percent = Math.round((current / stepOrder.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Step {current} of 4</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function UnifiedPropertyWizard({
  open,
  accountId,
  onOpenChange,
  onCreatePropertyWithSetup,
  onComplete
}: UnifiedPropertyWizardProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);
  const [step, setStep] = useState<WizardStep>("property");
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
  }, [open]);

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
        monthlyRentDollars: nextRent
      };
    });
  }, [units]);

  const selectedLeaseUnit = useMemo(
    () => units.find((unit) => unit.id === lease.leasedUnitId) ?? units[0] ?? null,
    [lease.leasedUnitId, units]
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
            monthlyRentDollars: selectedLeaseUnit.monthlyRentDollars
          }
    );
  }, [selectedLeaseUnit]);

  const propertyStepError = getPropertyStepError({
    propertyName,
    addressLine1,
    city,
    stateCode,
    postalCode
  });
  const unitStepError = getUnitStepError(units);
  const leaseStepError = getLeaseStepError(lease);

  const goBack = () => {
    setErrorMessage(null);
    const currentIndex = getStepIndex(step);
    if (currentIndex > 0) {
      setStep(stepOrder[currentIndex - 1]);
    }
  };

  const goNext = () => {
    setErrorMessage(null);

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
        propertyType
      },
      units: units.map((unit) => ({
        id: unit.id,
        label: unit.label.trim(),
        bedrooms: parseNumber(unit.bedrooms, 0),
        bathrooms: parseNumber(unit.bathrooms, 0),
        squareFeet: unit.squareFeet.trim() ? parseNumber(unit.squareFeet, 0) : null,
        monthlyRentDollars: parseNumber(unit.monthlyRentDollars, 0)
      })),
      lease: {
        hasTenant: lease.hasTenant,
        leasedUnitId: lease.leasedUnitId,
        tenantEmail: lease.tenantEmail.trim(),
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRentDollars: parseNumber(lease.monthlyRentDollars, 0),
        depositDollars: parseNumber(lease.depositDollars, 0)
      }
    };

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      if (accountId) {
        formData.set("accountId", accountId);
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
    monthlyRentCents: Math.round(parseNumber(unit.monthlyRentDollars, 0) * 100)
  }));

  return (
    <ModalOverlay open={open} onClose={() => onOpenChange(false)}>
      <div className="flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] border border-border bg-background shadow-2xl sm:max-h-[85vh] sm:rounded-[28px]">
        <div className="shrink-0 border-b border-border/60 px-4 pb-0 pt-5 sm:px-6 sm:pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">New Property</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            Set up the property, units, lease, and tenant in one flow
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            One pass. No cleanup. Domus creates the records only after you confirm the full setup.
          </p>
          {step !== "success" ? <div className="py-5"><WizardProgress step={step} /></div> : null}
        </div>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-5 sm:px-6 sm:pb-6">
          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
          {successMessage && step === "success" ? <Alert variant="success">{successMessage}</Alert> : null}

          {step === "property" ? (
            <form
              className="space-y-5"
              onKeyDown={(event) => {
                if (shouldAdvanceOnEnter(event)) {
                  event.preventDefault();
                  goNext();
                }
              }}
              onSubmit={(event) => {
                event.preventDefault();
                goNext();
              }}
            >
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Building2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Property details</h3>
                  <p className="text-sm text-muted-foreground">Start with the address and property type so Domus can frame the setup correctly.</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                  <span>Property name</span>
                  <Input data-autofocus="true" value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="1st Home" title="Enter a recognizable property name." />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                  <span>Street address</span>
                  <Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="131 Chaste Tree Circle" title="Enter the street address." />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>City</span>
                  <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Springfield" title="Enter the city." />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>State</span>
                  <Input value={stateCode} onChange={(event) => setStateCode(event.target.value)} placeholder="IL" title="Enter the two-letter state code." />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>ZIP code</span>
                  <Input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="62701" title="Enter the ZIP code." />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>Property type</span>
                  <Select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)} title="Choose the property type.">
                    {PROPERTY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </label>
              </div>
            </form>
          ) : null}

          {step === "unit" ? (
            <form
              className="space-y-5"
              onKeyDown={(event) => {
                if (shouldAdvanceOnEnter(event)) {
                  event.preventDefault();
                  goNext();
                }
              }}
              onSubmit={(event) => {
                event.preventDefault();
                goNext();
              }}
            >
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Home className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Units</h3>
                  <p className="text-sm text-muted-foreground">Add the rentable space now so the lease step can inherit the right rent and label.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
                <Button
                  type="button"
                  variant={hasMultipleUnits ? "outline" : "default"}
                  size="sm"
                  onClick={() => setHasMultipleUnits(false)}
                  title="Set up a single rentable unit."
                >
                  One unit
                </Button>
                <Button
                  type="button"
                  variant={hasMultipleUnits ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHasMultipleUnits(true)}
                  title="Add multiple rentable units to this property."
                >
                  Multiple units
                </Button>
              </div>

              <div className="space-y-3">
                {units.map((unit, index) => (
                  <div key={unit.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{unit.label || `Unit ${index + 1}`}</p>
                        <p className="text-xs text-muted-foreground">Rent, beds, baths, and square footage live here.</p>
                      </div>
                      {hasMultipleUnits && units.length > 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setUnits((current) => current.filter((entry) => entry.id !== unit.id))}
                          title="Remove this draft unit."
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <label className="space-y-1.5 text-sm font-medium text-foreground xl:col-span-1">
                        <span>Label</span>
                        <Input
                          data-autofocus={index === 0 ? "true" : undefined}
                          value={unit.label}
                          onChange={(event) =>
                            setUnits((current) =>
                              current.map((entry) =>
                                entry.id === unit.id ? { ...entry, label: event.target.value } : entry
                              )
                            )
                          }
                          placeholder="Unit A"
                          title="Enter the unit label."
                        />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        <span>Bedrooms</span>
                        <Input type="number" min="0" step="1" value={unit.bedrooms} onChange={(event) => setUnits((current) => current.map((entry) => entry.id === unit.id ? { ...entry, bedrooms: event.target.value } : entry))} title="Enter the bedroom count." />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        <span>Bathrooms</span>
                        <Input type="number" min="0" step="0.5" value={unit.bathrooms} onChange={(event) => setUnits((current) => current.map((entry) => entry.id === unit.id ? { ...entry, bathrooms: event.target.value } : entry))} title="Enter the bathroom count." />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        <span>Sq ft</span>
                        <Input type="number" min="0" step="1" value={unit.squareFeet} onChange={(event) => setUnits((current) => current.map((entry) => entry.id === unit.id ? { ...entry, squareFeet: event.target.value } : entry))} placeholder="Optional" title="Enter square footage if you know it." />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        <span>Monthly rent</span>
                        <Input type="number" min="0" step="0.01" value={unit.monthlyRentDollars} onChange={(event) => setUnits((current) => current.map((entry) => entry.id === unit.id ? { ...entry, monthlyRentDollars: event.target.value } : entry))} placeholder="2350" title="Enter the monthly rent for this unit." />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {hasMultipleUnits ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUnits((current) => [...current, createUnitDraft(current.length)])}
                  title="Add another unit to this setup draft."
                >
                  Add another unit
                </Button>
              ) : null}
            </form>
          ) : null}

          {step === "lease" ? (
            <form
              className="space-y-5"
              onKeyDown={(event) => {
                if (shouldAdvanceOnEnter(event)) {
                  event.preventDefault();
                  goNext();
                }
              }}
              onSubmit={(event) => {
                event.preventDefault();
                goNext();
              }}
            >
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <UserRoundPlus className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Lease and tenant</h3>
                  <p className="text-sm text-muted-foreground">If you already have a tenant, Domus will invite them and create the lease right now.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
                <Button
                  type="button"
                  variant={lease.hasTenant ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLease((current) => ({ ...current, hasTenant: true }))}
                  title="Set up the first lease and send the tenant invite now."
                >
                  Yes, I have a tenant
                </Button>
                <Button
                  type="button"
                  variant={!lease.hasTenant ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLease((current) => ({ ...current, hasTenant: false }))}
                  title="Skip the lease and tenant for now."
                >
                  No, skip for now
                </Button>
              </div>

              {lease.hasTenant ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {units.length > 1 ? (
                    <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                      <span>Which unit is this lease for?</span>
                      <Select value={lease.leasedUnitId} onChange={(event) => setLease((current) => ({ ...current, leasedUnitId: event.target.value }))} title="Choose the unit for this first lease.">
                        {units.map((unit) => (
                          <option key={unit.id} value={unit.id}>{unit.label}</option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                  <label className="space-y-1.5 text-sm font-medium text-foreground md:col-span-2">
                    <span>Tenant email</span>
                    <Input data-autofocus="true" type="email" value={lease.tenantEmail} onChange={(event) => setLease((current) => ({ ...current, tenantEmail: event.target.value }))} placeholder="tenant@example.com" title="Enter the tenant email. Domus will send the invitation there." />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Lease start date</span>
                    <Input type="date" value={lease.startDate} onChange={(event) => setLease((current) => ({ ...current, startDate: event.target.value }))} title="Enter the lease start date." />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Lease end date</span>
                    <Input type="date" value={lease.endDate} onChange={(event) => setLease((current) => ({ ...current, endDate: event.target.value }))} title="Enter the lease end date." />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Monthly rent</span>
                    <Input type="number" min="0" step="0.01" value={lease.monthlyRentDollars} onChange={(event) => setLease((current) => ({ ...current, monthlyRentDollars: event.target.value }))} title="Confirm the monthly rent for the lease." />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    <span>Security deposit</span>
                    <Input type="number" min="0" step="0.01" value={lease.depositDollars} onChange={(event) => setLease((current) => ({ ...current, depositDollars: event.target.value }))} title="Optional security deposit amount." />
                  </label>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">
                  Domus will create the property and unit(s) now. You can add the tenant and lease later from the Leases section.
                </div>
              )}
            </form>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Confirm everything</h3>
                  <p className="text-sm text-muted-foreground">Review the setup once. Domus will create everything in one submission.</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="domus-card space-y-4 px-5 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Property</p>
                    <h4 className="mt-2 text-xl font-semibold text-foreground">{propertyName}</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{addressLine1}, {city}, {stateCode.toUpperCase()} {postalCode}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Units</p>
                    <div className="mt-3 space-y-3">
                      {summaryItems.map((unit) => (
                        <div key={unit.id} className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-foreground">{unit.label}</p>
                            <p className="text-sm font-medium text-foreground">{formatCurrency(unit.monthlyRentCents)}</p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {unit.bedrooms} bd • {unit.bathrooms} ba{unit.squareFeet ? ` • ${unit.squareFeet} sq ft` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="domus-card space-y-4 px-5 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lease</p>
                    {lease.hasTenant ? (
                      <>
                        <h4 className="mt-2 text-xl font-semibold text-foreground">{lease.tenantEmail || "Tenant invite pending"}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedLeaseUnit?.label ?? "Selected unit"} • {lease.startDate} to {lease.endDate}
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Rent {formatCurrency(Math.round(parseNumber(lease.monthlyRentDollars, 0) * 100))}
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
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                    Closing this wizard now will discard the draft. Nothing is saved until you click <span className="font-semibold text-foreground">Create Everything</span>.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === "success" ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
              <Badge variant="success" className="px-3 py-1 text-sm">Setup complete</Badge>
              <DomMascot size="lg" mood="celebrating" animate />
              <div className="space-y-2">
                <h3 className="text-3xl font-semibold tracking-tight text-foreground">Your property is set up.</h3>
                <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground">
                  {lease.hasTenant
                    ? `${lease.tenantEmail} will receive an invitation email, and the lease is ready to collect rent.`
                    : "The property and unit records are ready. You can add the tenant later from Leases."}
                </p>
              </div>
              <Button type="button" size="lg" onClick={finishSetup} title="Go to the property overview on the dashboard.">
                Go to Dashboard
              </Button>
            </div>
          ) : null}
        </div>

        {step !== "success" ? (
          <div className="shrink-0 border-t border-border/60 px-4 py-4 sm:px-6">
            <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", step === "property" && "sm:justify-end")}>
              {step !== "property" ? (
                <Button type="button" variant="outline" onClick={goBack} title="Go back to the previous setup step." className="w-full sm:w-auto">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : <div />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} title="Close this wizard without saving anything." className="w-full sm:w-auto">
                  Close
                </Button>
                {step === "confirm" ? (
                  <Button type="button" loading={isPending} onClick={handleSubmit} title="Create the property, units, lease, and tenant invitation in one submission." className="w-full sm:w-auto">
                    Create Everything
                  </Button>
                ) : (
                  <Button type="button" onClick={goNext} title="Continue to the next step." className="w-full sm:w-auto">
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
