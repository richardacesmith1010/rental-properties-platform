"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ManagerAssignmentOption } from "@/lib/manager-payments";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyOption {
  id: string;
  name: string;
}

interface ManagerPaymentFormProps {
  properties: PropertyOption[];
  managers: ManagerAssignmentOption[];
  action: StatefulAction;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ManagerPaymentForm({
  properties,
  managers,
  action,
  onSuccess,
  onCancel
}: ManagerPaymentFormProps) {
  const [state, formAction] = useFormState(action, null);
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [category, setCategory] = useState<"reimbursement" | "custom">("reimbursement");

  useEffect(() => {
    if (state?.success) {
      onSuccess?.();
    }
  }, [onSuccess, state]);

  const eligibleManagers = useMemo(
    () => managers.filter((manager) => manager.propertyIds.includes(selectedPropertyId)),
    [managers, selectedPropertyId]
  );
  const canSubmit = Boolean(selectedPropertyId) && Boolean(selectedManagerId);

  useEffect(() => {
    if (eligibleManagers.length === 0) {
      setSelectedManagerId("");
      return;
    }

    setSelectedManagerId((current) =>
      eligibleManagers.some((manager) => manager.id === current) ? current : eligibleManagers[0]?.id ?? ""
    );
  }, [eligibleManagers]);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Record manager payment</h3>
          <p className="text-sm text-muted-foreground">
            Capture one-off reimbursements or custom manager payments with a PDF invoice.
          </p>
        </div>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} title="Close manager payment form.">
            Cancel
          </Button>
        ) : null}
      </div>

      {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.success ? <Alert variant="success">{state.message ?? "Manager payment recorded."}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>Property</span>
          <Select
            name="propertyId"
            value={selectedPropertyId}
            onChange={(event) => setSelectedPropertyId(event.target.value)}
            title="Select the property for this manager payment."
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
            title="Select the manager receiving this payment."
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

      <div className="space-y-2 text-sm font-medium text-foreground">
        <span>Category</span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={category === "reimbursement" ? "default" : "outline"}
            onClick={() => setCategory("reimbursement")}
            title="Record a reimbursement for expenses the manager covered."
          >
            Reimbursement
          </Button>
          <Button
            type="button"
            variant={category === "custom" ? "default" : "outline"}
            onClick={() => setCategory("custom")}
            title="Record a custom one-off manager payment."
          >
            Custom Payment
          </Button>
        </div>
        <input type="hidden" name="category" value={category} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-foreground md:col-span-2">
          <span>Description</span>
          <Input
            name="description"
            placeholder={category === "reimbursement" ? "Lock replacement at Unit 3B" : "Emergency tenant coordination"}
            title="Describe what this manager payment covers."
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>Amount (USD)</span>
          <Input name="amountDollars" type="number" min="0.01" step="0.01" title="Enter the total amount for this payment." />
        </label>
        <label className="space-y-1 text-sm font-medium text-foreground md:col-span-2">
          <span>Notes</span>
          <Textarea name="notes" rows={3} placeholder="Optional details for the invoice." title="Add optional notes for the PDF invoice." />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} title="Cancel manager payment entry.">
            Cancel
          </Button>
        ) : null}
        <SubmitButton disabled={!canSubmit} title="Record this manager payment and generate an invoice.">
          Record Payment
        </SubmitButton>
      </div>
    </form>
  );
}
