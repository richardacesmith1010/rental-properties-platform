"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ManagerAssignmentOption } from "@/lib/manager-payments";
import { formatCurrency } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyOption {
  id: string;
  name: string;
}

interface ManagerConfigFormProps {
  properties: PropertyOption[];
  managers: ManagerAssignmentOption[];
  baseRentCentsByProperty: Record<string, number>;
  action: StatefulAction;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ManagerConfigForm({
  properties,
  managers,
  baseRentCentsByProperty,
  action,
  onSuccess,
  onCancel
}: ManagerConfigFormProps) {
  const [state, formAction] = useFormState(action, null);
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [paymentType, setPaymentType] = useState<"percentage" | "flat">("percentage");

  useEffect(() => {
    if (state?.success) {
      onSuccess?.();
    }
  }, [onSuccess, state]);

  const eligibleManagers = useMemo(
    () => managers.filter((manager) => manager.propertyIds.includes(selectedPropertyId)),
    [managers, selectedPropertyId]
  );

  useEffect(() => {
    if (eligibleManagers.length === 0) {
      setSelectedManagerId("");
      return;
    }

    setSelectedManagerId((current) =>
      eligibleManagers.some((manager) => manager.id === current) ? current : eligibleManagers[0]?.id ?? ""
    );
  }, [eligibleManagers]);

  const baseRentDollars = ((baseRentCentsByProperty[selectedPropertyId] ?? 0) / 100).toFixed(2);
  const canSubmit = Boolean(selectedPropertyId) && Boolean(selectedManagerId);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Recurring manager payment</h3>
          <p className="text-sm text-muted-foreground">
            Set a flat monthly fee or commission against the assigned manager for a property.
          </p>
        </div>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} title="Close recurring payment setup.">
            Cancel
          </Button>
        ) : null}
      </div>

      {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.success ? <Alert variant="success">{state.message ?? "Recurring manager payment saved."}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>Property</span>
          <Select
            name="propertyId"
            value={selectedPropertyId}
            onChange={(event) => setSelectedPropertyId(event.target.value)}
            title="Select the property for this recurring manager payment."
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>Manager</span>
          <Select
            name="managerProfileId"
            value={selectedManagerId}
            onChange={(event) => setSelectedManagerId(event.target.value)}
            title="Select the assigned manager for this property."
          >
            {eligibleManagers.length > 0 ? (
              eligibleManagers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName} - {manager.email}
                </option>
              ))
            ) : (
              <option value="">Assign a manager to this property first</option>
            )}
          </Select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 text-sm font-medium text-foreground">
          <span>Payment type</span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={paymentType === "percentage" ? "default" : "outline"}
              onClick={() => setPaymentType("percentage")}
              title="Use a percentage of rent for this manager payment."
            >
              Percentage of rent
            </Button>
            <Button
              type="button"
              variant={paymentType === "flat" ? "default" : "outline"}
              onClick={() => setPaymentType("flat")}
              title="Use a flat monthly fee for this manager payment."
            >
              Flat fee
            </Button>
          </div>
          <input type="hidden" name="paymentType" value={paymentType} />
          <input type="hidden" name="frequency" value="monthly" />
        </div>

        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>Label</span>
          <Input name="label" defaultValue="Property Management Fee" title="Describe this recurring manager payment." />
        </label>
      </div>

      {paymentType === "percentage" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-foreground">
            <span>Commission rate (%)</span>
            <Input
              name="percentageRate"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              defaultValue="9.00"
              title="Enter the monthly manager commission rate."
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground">
            <span>Base rent (USD)</span>
            <Input
              name="baseRentDollars"
              type="number"
              min="0"
              step="0.01"
              defaultValue={baseRentDollars}
              title={`Current scheduled rent for this property is ${formatCurrency(baseRentCentsByProperty[selectedPropertyId] ?? 0)}.`}
            />
          </label>
        </div>
      ) : (
        <label className="block space-y-1 text-sm font-medium text-foreground">
          <span>Flat monthly amount (USD)</span>
          <Input
            name="flatAmountDollars"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue="500.00"
            title="Enter the flat monthly manager payment amount."
          />
        </label>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} title="Cancel recurring payment setup.">
            Cancel
          </Button>
        ) : null}
        <SubmitButton disabled={!canSubmit} title="Save recurring manager payment terms.">
          Save Recurring Terms
        </SubmitButton>
      </div>
    </form>
  );
}
