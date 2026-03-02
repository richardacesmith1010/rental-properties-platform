"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import type { PortfolioData } from "@/lib/portfolio";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface OperationsSectionProps {
  portfolio: PortfolioData;
  ownershipAccounts: OwnershipAccountDTO[];
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onPropertyCreated?: () => void;
  onUnitCreated?: () => void;
  onLeaseCreated?: () => void;
}

type OperationTask = "property" | "unit" | "lease";

interface LeaseDraft {
  propertyId: string;
  unitId: string;
  tenantProfileId: string;
  startDate: string;
  endDate: string;
  dueDayOfMonth: string;
  monthlyRentDollars: string;
  depositDollars: string;
}

interface PropertyDraft {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  ownerAccountId: string;
}

interface UnitDraft {
  propertyId: string;
  unitNumber: string;
  bedrooms: string;
  bathrooms: string;
  monthlyRentDollars: string;
}

const LEASE_STEP_LABELS = [
  "Pick Property",
  "Pick Unit",
  "Pick Tenant",
  "Set Lease Dates",
  "Set Billing Terms",
  "Review & Save"
] as const;

const PROPERTY_STEP_LABELS = [
  "Property Name",
  "Street Address",
  "City",
  "State",
  "ZIP Code",
  "Ownership Account",
  "Review & Save"
] as const;

const UNIT_STEP_LABELS = [
  "Pick Property",
  "Unit Label",
  "Bedrooms",
  "Bathrooms",
  "Default Rent",
  "Review & Save"
] as const;

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      Saved successfully!
    </p>
  );
}

export function OperationsSection({
  portfolio,
  ownershipAccounts,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onPropertyCreated,
  onUnitCreated,
  onLeaseCreated
}: OperationsSectionProps) {
  const [propertyState, propertyAction] = useFormState(onCreateProperty, null);
  const [unitState, unitAction] = useFormState(onCreateUnit, null);
  const [leaseState, leaseAction] = useFormState(onCreateLease, null);
  const handledPropertyStateRef = useRef<ActionState>(null);
  const handledUnitStateRef = useRef<ActionState>(null);
  const handledLeaseStateRef = useRef<ActionState>(null);
  const [activeTask, setActiveTask] = useState<OperationTask>("property");
  const [propertyStepIndex, setPropertyStepIndex] = useState(0);
  const [unitStepIndex, setUnitStepIndex] = useState(0);
  const [leaseStepIndex, setLeaseStepIndex] = useState(0);
  const [skippedPropertySteps, setSkippedPropertySteps] = useState<number[]>([]);
  const [skippedUnitSteps, setSkippedUnitSteps] = useState<number[]>([]);
  const [skippedLeaseSteps, setSkippedLeaseSteps] = useState<number[]>([]);
  const [propertyDraft, setPropertyDraft] = useState<PropertyDraft>({
    name: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    ownerAccountId: ""
  });
  const [unitDraft, setUnitDraft] = useState<UnitDraft>({
    propertyId: "",
    unitNumber: "",
    bedrooms: "1",
    bathrooms: "1",
    monthlyRentDollars: ""
  });
  const [leaseDraft, setLeaseDraft] = useState<LeaseDraft>({
    propertyId: "",
    unitId: "",
    tenantProfileId: "",
    startDate: "",
    endDate: "",
    dueDayOfMonth: "1",
    monthlyRentDollars: "",
    depositDollars: "0"
  });

  const propertyRequiredComplete = useMemo(() => {
    return Boolean(
      propertyDraft.name &&
        propertyDraft.addressLine1 &&
        propertyDraft.city &&
        propertyDraft.state &&
        propertyDraft.postalCode
    );
  }, [propertyDraft]);

  const propertyStepComplete = (step: number) => {
    if (step === 0) return Boolean(propertyDraft.name);
    if (step === 1) return Boolean(propertyDraft.addressLine1);
    if (step === 2) return Boolean(propertyDraft.city);
    if (step === 3) return Boolean(propertyDraft.state);
    if (step === 4) return Boolean(propertyDraft.postalCode);
    if (step === 5) return true;
    return propertyRequiredComplete;
  };

  const unitRequiredComplete = useMemo(() => {
    return Boolean(
      unitDraft.propertyId &&
        unitDraft.unitNumber &&
        unitDraft.bedrooms &&
        unitDraft.bathrooms &&
        unitDraft.monthlyRentDollars
    );
  }, [unitDraft]);

  const unitStepComplete = (step: number) => {
    if (step === 0) return Boolean(unitDraft.propertyId);
    if (step === 1) return Boolean(unitDraft.unitNumber);
    if (step === 2) return Boolean(unitDraft.bedrooms);
    if (step === 3) return Boolean(unitDraft.bathrooms);
    if (step === 4) return Boolean(unitDraft.monthlyRentDollars);
    return unitRequiredComplete;
  };

  const markPropertyStepSkipped = (step: number) => {
    setSkippedPropertySteps((previous) =>
      previous.includes(step) ? previous : [...previous, step]
    );
  };

  const markUnitStepSkipped = (step: number) => {
    setSkippedUnitSteps((previous) =>
      previous.includes(step) ? previous : [...previous, step]
    );
  };

  const moveToNextPropertyStep = () => {
    setPropertyStepIndex((current) => Math.min(current + 1, PROPERTY_STEP_LABELS.length - 1));
  };

  const moveToPreviousPropertyStep = () => {
    setPropertyStepIndex((current) => Math.max(current - 1, 0));
  };

  const moveToNextUnitStep = () => {
    setUnitStepIndex((current) => Math.min(current + 1, UNIT_STEP_LABELS.length - 1));
  };

  const moveToPreviousUnitStep = () => {
    setUnitStepIndex((current) => Math.max(current - 1, 0));
  };

  const handleEnterAdvance = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    canAdvance: boolean,
    moveNext: () => void
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) {
      moveNext();
    }
  };

  const unitsForSelectedProperty = useMemo(
    () =>
      portfolio.units.filter(
        (unit) => !leaseDraft.propertyId || unit.propertyId === leaseDraft.propertyId
      ),
    [leaseDraft.propertyId, portfolio.units]
  );

  const tenantsForSelectedProperty = useMemo(
    () =>
      portfolio.tenants.filter(
        (tenant) =>
          !leaseDraft.propertyId || tenant.propertyIds.includes(leaseDraft.propertyId)
      ),
    [leaseDraft.propertyId, portfolio.tenants]
  );

  const leaseRequiredComplete = useMemo(() => {
    return Boolean(
      leaseDraft.unitId &&
        leaseDraft.tenantProfileId &&
        leaseDraft.startDate &&
        leaseDraft.endDate &&
        leaseDraft.dueDayOfMonth &&
        leaseDraft.monthlyRentDollars &&
        leaseDraft.propertyId
    );
  }, [leaseDraft]);

  const leaseStepComplete = (step: number) => {
    if (step === 0) return Boolean(leaseDraft.propertyId);
    if (step === 1) return Boolean(leaseDraft.unitId);
    if (step === 2) return Boolean(leaseDraft.tenantProfileId);
    if (step === 3) return Boolean(leaseDraft.startDate && leaseDraft.endDate);
    if (step === 4) return Boolean(leaseDraft.dueDayOfMonth && leaseDraft.monthlyRentDollars);
    return leaseRequiredComplete;
  };

  const markLeaseStepSkipped = (step: number) => {
    setSkippedLeaseSteps((previous) =>
      previous.includes(step) ? previous : [...previous, step]
    );
  };

  const moveToNextLeaseStep = () => {
    setLeaseStepIndex((current) => Math.min(current + 1, LEASE_STEP_LABELS.length - 1));
  };

  const moveToPreviousLeaseStep = () => {
    setLeaseStepIndex((current) => Math.max(current - 1, 0));
  };

  useEffect(() => {
    if (!propertyState?.success) return;
    if (handledPropertyStateRef.current === propertyState) return;
    handledPropertyStateRef.current = propertyState;
    setPropertyStepIndex(0);
    setSkippedPropertySteps([]);
    setPropertyDraft({
      name: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      ownerAccountId: ""
    });
    setActiveTask("unit");
    onPropertyCreated?.();
  }, [onPropertyCreated, propertyState]);

  useEffect(() => {
    if (!unitState?.success) return;
    if (handledUnitStateRef.current === unitState) return;
    handledUnitStateRef.current = unitState;
    setUnitStepIndex(0);
    setSkippedUnitSteps([]);
    setUnitDraft({
      propertyId: "",
      unitNumber: "",
      bedrooms: "1",
      bathrooms: "1",
      monthlyRentDollars: ""
    });
    setActiveTask("lease");
    onUnitCreated?.();
  }, [onUnitCreated, unitState]);

  useEffect(() => {
    if (!leaseState?.success) return;
    if (handledLeaseStateRef.current === leaseState) return;
    handledLeaseStateRef.current = leaseState;
    setLeaseStepIndex(0);
    setSkippedLeaseSteps([]);
    setLeaseDraft({
      propertyId: "",
      unitId: "",
      tenantProfileId: "",
      startDate: "",
      endDate: "",
      dueDayOfMonth: "1",
      monthlyRentDollars: "",
      depositDollars: "0"
    });
    onLeaseCreated?.();
  }, [leaseState, onLeaseCreated]);

  const renderPropertyStep = () => {
    if (propertyStepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 1: Property name. This is the label owners/managers will see everywhere.
          </p>
          <Input
            value={propertyDraft.name}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                name: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, propertyStepComplete(propertyStepIndex), moveToNextPropertyStep)
            }
            placeholder="Example: Elm Street House"
            required
          />
        </div>
      );
    }

    if (propertyStepIndex === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 2: Street address. This is the full street line for the property.
          </p>
          <Input
            value={propertyDraft.addressLine1}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                addressLine1: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, propertyStepComplete(propertyStepIndex), moveToNextPropertyStep)
            }
            placeholder="123 Main St"
            required
          />
        </div>
      );
    }

    if (propertyStepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 3: City. This drives mailing, filtering, and local reporting.
          </p>
          <Input
            value={propertyDraft.city}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                city: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, propertyStepComplete(propertyStepIndex), moveToNextPropertyStep)
            }
            placeholder="City"
            required
          />
        </div>
      );
    }

    if (propertyStepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 4: State abbreviation (for example, CO).
          </p>
          <Input
            value={propertyDraft.state}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                state: event.target.value.toUpperCase()
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, propertyStepComplete(propertyStepIndex), moveToNextPropertyStep)
            }
            placeholder="State"
            maxLength={2}
            required
          />
        </div>
      );
    }

    if (propertyStepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 5: ZIP code. This is required for property records.
          </p>
          <Input
            value={propertyDraft.postalCode}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                postalCode: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, propertyStepComplete(propertyStepIndex), moveToNextPropertyStep)
            }
            placeholder="ZIP code"
            required
          />
        </div>
      );
    }

    if (propertyStepIndex === 5) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 6: Ownership account (optional). Leave blank to use your default account.
          </p>
          <Select
            value={propertyDraft.ownerAccountId}
            onChange={(event) =>
              setPropertyDraft((current) => ({
                ...current,
                ownerAccountId: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, true, moveToNextPropertyStep)
            }
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
          <p><span className="font-semibold">Name:</span> {propertyDraft.name || "Not set"}</p>
          <p><span className="font-semibold">Address:</span> {propertyDraft.addressLine1 || "Not set"}</p>
          <p><span className="font-semibold">City:</span> {propertyDraft.city || "Not set"}</p>
          <p><span className="font-semibold">State:</span> {propertyDraft.state || "Not set"}</p>
          <p><span className="font-semibold">ZIP:</span> {propertyDraft.postalCode || "Not set"}</p>
          <p><span className="font-semibold">Ownership:</span> {ownershipAccounts.find((account) => account.id === propertyDraft.ownerAccountId)?.displayName ?? "Default ownership account"}</p>
        </div>
        {!propertyRequiredComplete && (
          <p className="text-xs text-amber-700">
            Required details are still missing. Complete all required steps before save.
          </p>
        )}
        <form className="space-y-2" action={propertyAction}>
          <input type="hidden" name="name" value={propertyDraft.name} />
          <input type="hidden" name="addressLine1" value={propertyDraft.addressLine1} />
          <input type="hidden" name="city" value={propertyDraft.city} />
          <input type="hidden" name="state" value={propertyDraft.state} />
          <input type="hidden" name="postalCode" value={propertyDraft.postalCode} />
          <input type="hidden" name="ownerAccountId" value={propertyDraft.ownerAccountId} />
          <SubmitButton
            className="w-full"
            title="Save this property."
            disabled={!propertyRequiredComplete}
          >
            Save Property
          </SubmitButton>
        </form>
      </div>
    );
  };

  const renderUnitStep = () => {
    if (unitStepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 1: Pick the property this unit belongs to.
          </p>
          <Select
            value={unitDraft.propertyId}
            onChange={(event) =>
              setUnitDraft((current) => ({
                ...current,
                propertyId: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, unitStepComplete(unitStepIndex), moveToNextUnitStep)
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

    if (unitStepIndex === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 2: Unit label. This is what tenants and staff will reference.
          </p>
          <Input
            value={unitDraft.unitNumber}
            onChange={(event) =>
              setUnitDraft((current) => ({
                ...current,
                unitNumber: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, unitStepComplete(unitStepIndex), moveToNextUnitStep)
            }
            placeholder="Example: Unit 2B"
            required
          />
        </div>
      );
    }

    if (unitStepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 3: Bedrooms count.
          </p>
          <Input
            type="number"
            min={0}
            value={unitDraft.bedrooms}
            onChange={(event) =>
              setUnitDraft((current) => ({
                ...current,
                bedrooms: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, unitStepComplete(unitStepIndex), moveToNextUnitStep)
            }
            required
          />
        </div>
      );
    }

    if (unitStepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 4: Bathrooms count. Decimals are allowed (example: 1.5).
          </p>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={unitDraft.bathrooms}
            onChange={(event) =>
              setUnitDraft((current) => ({
                ...current,
                bathrooms: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, unitStepComplete(unitStepIndex), moveToNextUnitStep)
            }
            required
          />
        </div>
      );
    }

    if (unitStepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 5: Default monthly rent for this unit.
          </p>
          <Input
            type="number"
            min={1}
            step="0.01"
            value={unitDraft.monthlyRentDollars}
            onChange={(event) =>
              setUnitDraft((current) => ({
                ...current,
                monthlyRentDollars: event.target.value
              }))
            }
            onKeyDown={(event) =>
              handleEnterAdvance(event, unitStepComplete(unitStepIndex), moveToNextUnitStep)
            }
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
          <p><span className="font-semibold">Property:</span> {portfolio.properties.find((property) => property.id === unitDraft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Unit Label:</span> {unitDraft.unitNumber || "Not set"}</p>
          <p><span className="font-semibold">Bedrooms:</span> {unitDraft.bedrooms || "Not set"}</p>
          <p><span className="font-semibold">Bathrooms:</span> {unitDraft.bathrooms || "Not set"}</p>
          <p><span className="font-semibold">Default Rent:</span> {unitDraft.monthlyRentDollars ? `$${unitDraft.monthlyRentDollars}` : "Not set"}</p>
        </div>
        {!unitRequiredComplete && (
          <p className="text-xs text-amber-700">
            Required details are still missing. Complete all required steps before save.
          </p>
        )}
        <form className="space-y-2" action={unitAction}>
          <input type="hidden" name="propertyId" value={unitDraft.propertyId} />
          <input type="hidden" name="unitNumber" value={unitDraft.unitNumber} />
          <input type="hidden" name="bedrooms" value={unitDraft.bedrooms} />
          <input type="hidden" name="bathrooms" value={unitDraft.bathrooms} />
          <input type="hidden" name="monthlyRentDollars" value={unitDraft.monthlyRentDollars} />
          <SubmitButton
            className="w-full"
            title="Save this unit."
            disabled={!unitRequiredComplete}
          >
            Save Unit
          </SubmitButton>
        </form>
      </div>
    );
  };

  const renderLeaseStep = () => {
    if (leaseStepIndex === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 1: Select the property first. Everything else depends on this.
          </p>
          <Select
            value={leaseDraft.propertyId}
            onChange={(event) =>
              setLeaseDraft((current) => ({
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

    if (leaseStepIndex === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 2: Select the unit for this lease.
          </p>
          <Select
            value={leaseDraft.unitId}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                unitId: event.target.value
              }))
            }
            required
            disabled={!leaseDraft.propertyId}
          >
            <option value="">Select unit</option>
            {unitsForSelectedProperty.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} • Unit {unit.unitNumber}
              </option>
            ))}
          </Select>
          {!leaseDraft.propertyId && (
            <p className="text-xs text-amber-700">
              Pick a property first.
            </p>
          )}
        </div>
      );
    }

    if (leaseStepIndex === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 3: Select a tenant linked to this property.
          </p>
          <Select
            value={leaseDraft.tenantProfileId}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                tenantProfileId: event.target.value
              }))
            }
            required
            disabled={!leaseDraft.propertyId}
          >
            <option value="">Select tenant</option>
            {tenantsForSelectedProperty.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.fullName} ({tenant.email})
              </option>
            ))}
          </Select>
          {leaseDraft.propertyId && tenantsForSelectedProperty.length === 0 && (
            <p className="text-xs text-amber-700">
              No tenants are linked to this property yet. Invite tenant for this property first.
            </p>
          )}
        </div>
      );
    }

    if (leaseStepIndex === 3) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 4: Enter lease start and end dates.
          </p>
          <Input
            type="date"
            value={leaseDraft.startDate}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                startDate: event.target.value
              }))
            }
            required
          />
          <Input
            type="date"
            value={leaseDraft.endDate}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                endDate: event.target.value
              }))
            }
            required
          />
        </div>
      );
    }

    if (leaseStepIndex === 4) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 5: Enter billing terms.
          </p>
          <Input
            type="number"
            min={1}
            max={28}
            value={leaseDraft.dueDayOfMonth}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                dueDayOfMonth: event.target.value
              }))
            }
            required
            placeholder="Due day of month"
          />
          <Input
            type="number"
            min={1}
            step="0.01"
            value={leaseDraft.monthlyRentDollars}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                monthlyRentDollars: event.target.value
              }))
            }
            required
            placeholder="Monthly rent (USD)"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={leaseDraft.depositDollars}
            onChange={(event) =>
              setLeaseDraft((current) => ({
                ...current,
                depositDollars: event.target.value
              }))
            }
            placeholder="Deposit (USD)"
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          Final step: review and save the lease.
        </p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Property:</span> {portfolio.properties.find((property) => property.id === leaseDraft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Unit:</span> {portfolio.units.find((unit) => unit.id === leaseDraft.unitId)?.unitNumber ?? "Not set"}</p>
          <p><span className="font-semibold">Tenant:</span> {portfolio.tenants.find((tenant) => tenant.id === leaseDraft.tenantProfileId)?.email ?? "Not set"}</p>
          <p><span className="font-semibold">Dates:</span> {leaseDraft.startDate || "?"} → {leaseDraft.endDate || "?"}</p>
          <p><span className="font-semibold">Billing:</span> day {leaseDraft.dueDayOfMonth || "?"}, ${leaseDraft.monthlyRentDollars || "?"}/month</p>
        </div>
        {!leaseRequiredComplete && (
          <p className="text-xs text-amber-700">
            You can skip steps, but lease save stays disabled until required details are completed.
          </p>
        )}
        <form className="space-y-2" action={leaseAction}>
          <input type="hidden" name="unitId" value={leaseDraft.unitId} />
          <input type="hidden" name="tenantProfileId" value={leaseDraft.tenantProfileId} />
          <input type="hidden" name="startDate" value={leaseDraft.startDate} />
          <input type="hidden" name="endDate" value={leaseDraft.endDate} />
          <input type="hidden" name="dueDayOfMonth" value={leaseDraft.dueDayOfMonth} />
          <input type="hidden" name="monthlyRentDollars" value={leaseDraft.monthlyRentDollars} />
          <input type="hidden" name="depositDollars" value={leaseDraft.depositDollars} />
          <SubmitButton
            className="w-full"
            title="Save this lease with the details above."
            disabled={!leaseRequiredComplete}
          >
            Save Lease
          </SubmitButton>
        </form>
      </div>
    );
  };

  return (
    <div id="operations" className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Operations Workflow</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeTask === "property" ? "default" : "outline"}
            onClick={() => setActiveTask("property")}
            title="Open the property setup step."
          >
            1. Property
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTask === "unit" ? "default" : "outline"}
            onClick={() => setActiveTask("unit")}
            title="Open the unit setup step."
          >
            2. Unit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTask === "lease" ? "default" : "outline"}
            onClick={() => setActiveTask("lease")}
            title="Open the guided lease setup steps."
          >
            3. Lease
          </Button>
        </div>
      </div>

      {activeTask === "property" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Add Property</CardTitle>
            <p className="text-xs text-zinc-500">One field at a time. Press Enter or click Next.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormError state={propertyState} />
            <FormSuccess state={propertyState} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROPERTY_STEP_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={`rounded-md border px-2 py-2 text-xs ${
                    propertyStepIndex === index
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : propertyStepComplete(index)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : skippedPropertySteps.includes(index)
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {renderPropertyStep()}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={moveToPreviousPropertyStep}
                disabled={propertyStepIndex === 0}
                title="Go back one step."
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={moveToNextPropertyStep}
                disabled={
                  propertyStepIndex >= PROPERTY_STEP_LABELS.length - 1 ||
                  !propertyStepComplete(propertyStepIndex)
                }
                title="Complete this step and move to the next step."
              >
                Next
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  markPropertyStepSkipped(propertyStepIndex);
                  moveToNextPropertyStep();
                }}
                disabled={propertyStepIndex >= PROPERTY_STEP_LABELS.length - 1}
                title="Skip this step for now and continue."
              >
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTask === "unit" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Add Unit</CardTitle>
            <p className="text-xs text-zinc-500">One field at a time. Press Enter or click Next.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormError state={unitState} />
            <FormSuccess state={unitState} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {UNIT_STEP_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={`rounded-md border px-2 py-2 text-xs ${
                    unitStepIndex === index
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : unitStepComplete(index)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : skippedUnitSteps.includes(index)
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {renderUnitStep()}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={moveToPreviousUnitStep}
                disabled={unitStepIndex === 0}
                title="Go back one step."
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={moveToNextUnitStep}
                disabled={
                  unitStepIndex >= UNIT_STEP_LABELS.length - 1 ||
                  !unitStepComplete(unitStepIndex)
                }
                title="Complete this step and move to the next step."
              >
                Next
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  markUnitStepSkipped(unitStepIndex);
                  moveToNextUnitStep();
                }}
                disabled={unitStepIndex >= UNIT_STEP_LABELS.length - 1}
                title="Skip this step for now and continue."
              >
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTask === "lease" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Create Lease</CardTitle>
            <p className="text-xs text-zinc-500">
              One step at a time. You can skip forward, but final save requires all required details.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormError state={leaseState} />
            <FormSuccess state={leaseState} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LEASE_STEP_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={`rounded-md border px-2 py-2 text-xs ${
                    leaseStepIndex === index
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : leaseStepComplete(index)
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : skippedLeaseSteps.includes(index)
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {renderLeaseStep()}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={moveToPreviousLeaseStep}
                disabled={leaseStepIndex === 0}
                title="Go back one step."
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={moveToNextLeaseStep}
                disabled={leaseStepIndex >= LEASE_STEP_LABELS.length - 1 || !leaseStepComplete(leaseStepIndex)}
                title="Complete this step and move to the next step."
              >
                Next
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  markLeaseStepSkipped(leaseStepIndex);
                  moveToNextLeaseStep();
                }}
                disabled={leaseStepIndex >= LEASE_STEP_LABELS.length - 1}
                title="Skip this step for now and continue."
              >
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
