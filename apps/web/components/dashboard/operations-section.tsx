"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const LEASE_STEP_LABELS = [
  "Pick Property",
  "Pick Unit",
  "Pick Tenant",
  "Set Lease Dates",
  "Set Billing Terms",
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
  const [leaseStepIndex, setLeaseStepIndex] = useState(0);
  const [skippedLeaseSteps, setSkippedLeaseSteps] = useState<number[]>([]);
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
    if (!propertyState?.success || !onPropertyCreated) return;
    if (handledPropertyStateRef.current === propertyState) return;
    handledPropertyStateRef.current = propertyState;
    setActiveTask("unit");
    onPropertyCreated();
  }, [onPropertyCreated, propertyState]);

  useEffect(() => {
    if (!unitState?.success || !onUnitCreated) return;
    if (handledUnitStateRef.current === unitState) return;
    handledUnitStateRef.current = unitState;
    setActiveTask("lease");
    onUnitCreated();
  }, [onUnitCreated, unitState]);

  useEffect(() => {
    if (!leaseState?.success || !onLeaseCreated) return;
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
    onLeaseCreated();
  }, [leaseState, onLeaseCreated]);

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
            <p className="text-xs text-zinc-500">Create the property first. Units and leases depend on this.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" action={propertyAction}>
              <FormError state={propertyState} />
              <FormSuccess state={propertyState} />
              <Input name="name" placeholder="Property name" required />
              <Input name="addressLine1" placeholder="Street address" required />
              <Input name="city" placeholder="City" required />
              <Input name="state" placeholder="State" required />
              <Input name="postalCode" placeholder="ZIP" required />
              <Select name="ownerAccountId">
                <option value="">Default ownership account</option>
                {ownershipAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </Select>
              <SubmitButton className="w-full" title="Create this property in your workspace.">
                Save Property
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTask === "unit" && (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Add Unit</CardTitle>
            <p className="text-xs text-zinc-500">Add a unit under an existing property.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" action={unitAction}>
              <FormError state={unitState} />
              <FormSuccess state={unitState} />
              <Select name="propertyId" required>
                <option value="">Select property</option>
                {portfolio.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
              <Input name="unitNumber" placeholder="Unit number (ex: 2B)" required />
              <Input
                name="bedrooms"
                type="number"
                min={0}
                placeholder="Bedrooms"
                defaultValue={1}
                required
              />
              <Input
                name="bathrooms"
                type="number"
                min={0}
                step="0.5"
                placeholder="Bathrooms"
                defaultValue={1}
                required
              />
              <Input
                name="monthlyRentDollars"
                type="number"
                min={1}
                step="0.01"
                placeholder="Monthly rent (USD)"
                required
              />
              <SubmitButton className="w-full" title="Create this unit under the selected property.">
                Save Unit
              </SubmitButton>
            </form>
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
