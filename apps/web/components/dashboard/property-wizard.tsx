"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, DoorOpen, UserPlus } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import type { ManagerAssignmentOption } from "@/lib/manager-payments";
import { cn } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyWizardProps {
  open: boolean;
  activeAccountId?: string | null;
  managers: ManagerAssignmentOption[];
  onOpenChange: (open: boolean) => void;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onInviteManager?: StatefulAction;
  onOpenSection: (sectionId: string) => void;
}

type PropertyType = "single_family" | "duplex" | "triplex" | "apartment" | "condo" | "townhouse";

type WizardStep = 0 | 1 | 2 | 3;

interface UnitDraft {
  id: string;
  label: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
}

const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: "single_family", label: "Single Family" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "apartment", label: "Apartment" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" }
];

function createUnitDraft(index = 0): UnitDraft {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    label: index === 0 ? "Unit A" : `Unit ${String.fromCharCode(65 + index)}`,
    bedrooms: "0",
    bathrooms: "1",
    squareFeet: ""
  };
}

function WizardProgress({ step }: { step: WizardStep }) {
  const current = step + 1;
  const percent = Math.round((current / 4) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Step {current} of 4</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PropertyWizard({
  open,
  activeAccountId,
  managers,
  onOpenChange,
  onCreateProperty,
  onCreateUnit,
  onInviteManager,
  onOpenSection
}: PropertyWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("single_family");
  const [unitDrafts, setUnitDrafts] = useState<UnitDraft[]>([createUnitDraft(0)]);
  const [managerChoice, setManagerChoice] = useState<"no" | "yes">("no");
  const [managerMode, setManagerMode] = useState<"existing" | "invite">("existing");
  const [selectedManagerId, setSelectedManagerId] = useState(managers[0]?.id ?? "");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerName, setManagerName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const managersRef = useRef(managers);
  const prevOpenRef = useRef(false);
  managersRef.current = managers;

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setStep(0);
      setPropertyId(null);
      setPropertyName("");
      setAddressLine1("");
      setCity("");
      setStateCode("");
      setPostalCode("");
      setPropertyType("single_family");
      setUnitDrafts([createUnitDraft(0)]);
      setManagerChoice("no");
      setManagerMode("existing");
      setSelectedManagerId(managersRef.current[0]?.id ?? "");
      setManagerEmail("");
      setManagerName("");
      setErrorMessage(null);
      setSuccessMessage(null);
    }
    prevOpenRef.current = open;
    // Reset only on open-state transitions so typing and step changes never remount the wizard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedManager = useMemo(
    () => managers.find((manager) => manager.id === selectedManagerId) ?? null,
    [managers, selectedManagerId]
  );

  const handleCreateProperty = () => {
    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("name", propertyName);
      formData.set("addressLine1", addressLine1);
      formData.set("city", city);
      formData.set("state", stateCode);
      formData.set("postalCode", postalCode);
      formData.set("propertyType", propertyType);
      if (activeAccountId) {
        formData.set("ownerAccountId", activeAccountId);
      }

      const result = await onCreateProperty(null, formData);
      if (!result?.success) {
        setErrorMessage(result?.error ?? "Unable to create this property right now.");
        return;
      }

      if (!result.propertyId) {
        setErrorMessage("Property created, but Domus could not recover the new property ID.");
        return;
      }

      setPropertyId(result.propertyId);
      setSuccessMessage("Property created. Add units next.");
      setStep(1);
    });
  };

  const handleCreateUnits = () => {
    if (!propertyId) {
      setErrorMessage("Create the property before adding units.");
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      const drafts = propertyType === "single_family" && unitDrafts.every((draft) => !draft.label.trim())
        ? [
            {
              ...createUnitDraft(0),
              label: "Main"
            }
          ]
        : unitDrafts;

      const normalizedDrafts = drafts.length === 0 && propertyType === "single_family"
        ? [
            {
              ...createUnitDraft(0),
              label: "Main"
            }
          ]
        : drafts;

      for (const draft of normalizedDrafts) {
        const label = draft.label.trim() || "Main";
        const formData = new FormData();
        formData.set("propertyId", propertyId);
        formData.set("unitNumber", label);
        formData.set("bedrooms", draft.bedrooms || "0");
        formData.set("bathrooms", draft.bathrooms || "0");
        formData.set("monthlyRentDollars", "0");
        if (draft.squareFeet) {
          formData.set("squareFeet", draft.squareFeet);
        }

        const result = await onCreateUnit(null, formData);
        if (!result?.success) {
          setErrorMessage(result?.error ?? `Unable to create ${label}.`);
          return;
        }
      }

      setSuccessMessage(normalizedDrafts.length === 1 ? "Unit created." : "Units created.");
      setStep(2);
    });
  };

  const handleAssignManager = () => {
    if (!propertyId || managerChoice === "no" || !onInviteManager) {
      setStep(3);
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("propertyId", propertyId);

      if (managerMode === "existing" && selectedManager) {
        formData.set("email", selectedManager.email);
        formData.set("fullName", selectedManager.fullName);
      } else {
        formData.set("email", managerEmail);
        formData.set("fullName", managerName);
      }

      const result = await onInviteManager(null, formData);
      if (!result?.success) {
        setErrorMessage(result?.error ?? "Unable to assign that manager right now.");
        return;
      }

      setSuccessMessage("Manager assigned.");
      setStep(3);
    });
  };

  const handleFinish = () => {
    onOpenChange(false);
    router.refresh();
    onOpenSection("portfolio");
  };

  const canGoBack = step > 0 && step < 3;

  return (
    <ModalOverlay open={open} onClose={() => onOpenChange(false)}>
      <div className="w-full max-w-3xl rounded-[28px] border border-border bg-background p-6 shadow-2xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">New Property</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Create a property, units, and manager assignment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a property, add units, and optionally assign a manager without leaving the dashboard.
          </p>
        </div>
        <div className="space-y-5">
        <WizardProgress step={step} />
        {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
        {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}

        {step === 0 ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <Building2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Property details</h3>
                <p className="text-sm text-muted-foreground">Create the property record first, then add units and an optional manager.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-foreground md:col-span-2">
                <span>Property name</span>
                <Input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Oak Street Duplex" title="Enter a recognizable property name." />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground md:col-span-2">
                <span>Street address</span>
                <Input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="123 Oak Street" title="Enter the street address for this property." />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                <span>City</span>
                <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Denver" title="Enter the city." />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                <span>State</span>
                <Input value={stateCode} onChange={(event) => setStateCode(event.target.value)} placeholder="CO" title="Enter the two-letter state code." />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                <span>ZIP code</span>
                <Input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="80202" title="Enter the ZIP code." />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                <span>Property type</span>
                <Select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)} title="Choose the property type.">
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <DoorOpen className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Add units</h3>
                <p className="text-sm text-muted-foreground">Create one or more units now. Single-family homes can skip and Domus will create a Main unit automatically.</p>
              </div>
            </div>
            <div className="space-y-3">
              {unitDrafts.map((draft, index) => (
                <div key={draft.id} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span>Label</span>
                    <Input
                      value={draft.label}
                      onChange={(event) =>
                        setUnitDrafts((current) =>
                          current.map((unit) => unit.id === draft.id ? { ...unit, label: event.target.value } : unit)
                        )
                      }
                      placeholder={`Unit ${String.fromCharCode(65 + index)}`}
                      title="Enter the unit label or number."
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span>Bedrooms</span>
                    <Input type="number" min="0" step="1" value={draft.bedrooms} onChange={(event) => setUnitDrafts((current) => current.map((unit) => unit.id === draft.id ? { ...unit, bedrooms: event.target.value } : unit))} title="Enter the bedroom count for this unit." />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span>Bathrooms</span>
                    <Input type="number" min="0" step="0.5" value={draft.bathrooms} onChange={(event) => setUnitDrafts((current) => current.map((unit) => unit.id === draft.id ? { ...unit, bathrooms: event.target.value } : unit))} title="Enter the bathroom count for this unit." />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span>Square feet</span>
                    <Input type="number" min="0" step="1" value={draft.squareFeet} onChange={(event) => setUnitDrafts((current) => current.map((unit) => unit.id === draft.id ? { ...unit, squareFeet: event.target.value } : unit))} placeholder="Optional" title="Enter optional square footage for this unit." />
                  </label>
                  <div className="md:col-span-4 flex justify-end">
                    <Button type="button" variant="ghost" onClick={() => setUnitDrafts((current) => current.length > 1 ? current.filter((unit) => unit.id !== draft.id) : current.map((unit) => unit.id === draft.id ? createUnitDraft(index) : unit))} title="Remove this draft unit from the list.">
                      Remove Unit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={() => setUnitDrafts((current) => [...current, createUnitDraft(current.length)])} title="Add another unit draft to this property.">
              Add Another Unit
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
              <UserPlus className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Assign manager</h3>
                <p className="text-sm text-muted-foreground">Invite a new manager or select an existing one assigned in Domus. You can also skip this step.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={managerChoice === "yes" ? "default" : "outline"} onClick={() => setManagerChoice("yes")} title="Assign a property manager during setup.">
                Yes, assign a manager
              </Button>
              <Button type="button" variant={managerChoice === "no" ? "default" : "outline"} onClick={() => setManagerChoice("no")} title="Skip manager assignment for now.">
                No manager yet
              </Button>
            </div>
            {managerChoice === "yes" ? (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={managerMode === "existing" ? "default" : "outline"} onClick={() => setManagerMode("existing")} title="Assign an existing manager by email.">
                    Existing manager
                  </Button>
                  <Button type="button" variant={managerMode === "invite" ? "default" : "outline"} onClick={() => setManagerMode("invite")} title="Invite a new manager by email.">
                    Invite manager
                  </Button>
                </div>
                {managerMode === "existing" ? (
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span>Choose manager</span>
                    <Select value={selectedManagerId} onChange={(event) => setSelectedManagerId(event.target.value)} title="Choose an existing manager to assign to this property.">
                      {managers.length > 0 ? (
                        managers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.fullName} - {manager.email}
                          </option>
                        ))
                      ) : (
                        <option value="">No existing managers available</option>
                      )}
                    </Select>
                  </label>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-foreground">
                      <span>Manager name</span>
                      <Input value={managerName} onChange={(event) => setManagerName(event.target.value)} placeholder="Jordan Manager" title="Enter the manager's full name." />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-foreground">
                      <span>Manager email</span>
                      <Input value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} placeholder="manager@example.com" title="Enter the manager's email address." />
                    </label>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold text-foreground">Property created</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {propertyName || "Your property"} is ready. You can keep building the workflow from here.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => { onOpenChange(false); router.refresh(); onOpenSection("leases"); }} title="Jump to lease creation for this property.">
                Create a Lease
              </Button>
              <Button type="button" variant="outline" onClick={() => { onOpenChange(false); router.refresh(); onOpenSection("invitations"); }} title="Open invitations to add a tenant.">
                Invite a Tenant
              </Button>
              <Button type="button" onClick={handleFinish} title="Return to the dashboard filtered to your portfolio.">
                Back to Dashboard
              </Button>
            </div>
          </div>
        ) : null}

        {step < 3 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={!canGoBack || isPending}
              onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
              title="Go back to the previous setup step."
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} title="Close the property wizard.">
                Close
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (step === 0) {
                    handleCreateProperty();
                    return;
                  }
                  if (step === 1) {
                    handleCreateUnits();
                    return;
                  }
                  handleAssignManager();
                }}
                title={step === 0 ? "Create the property and continue." : step === 1 ? "Create the drafted units and continue." : "Finish manager assignment and continue."}
                className={cn("min-w-[160px]")}
              >
                {step === 2 ? "Finish Setup" : "Next"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </ModalOverlay>
  );
}
