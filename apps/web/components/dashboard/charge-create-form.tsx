"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { CHARGE_CATEGORY_VALUES, chargeCategoryLabel } from "@/lib/charge-audit";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface LeaseOption {
  id: string;
  tenantLabel: string;
  propertyLabel: string;
}

interface ChargeCreateFormProps {
  open: boolean;
  leases: LeaseOption[];
  onSubmit: StatefulAction;
  onCancel: () => void;
}

export function ChargeCreateForm({
  open,
  leases,
  onSubmit,
  onCancel
}: ChargeCreateFormProps) {
  const [state, formAction] = useFormState(onSubmit, null);
  const defaultDueDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  useEffect(() => {
    if (state?.success) {
      onCancel();
    }
  }, [onCancel, state]);

  if (!open) {
    return null;
  }

  return (
    <ModalOverlay open={open} onClose={onCancel}>
      <div className="domus-card max-h-[85vh] overflow-y-auto p-6 scroll-smooth [-webkit-overflow-scrolling:touch]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Add Manual Charge</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a one-off charge and assign it to an active lease.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onCancel} title="Close this form.">
            Cancel
          </Button>
        </div>

        {state?.success ? (
          <Alert variant="success" className="mb-4">
            {state.message ?? "Manual charge created."}
          </Alert>
        ) : null}
        {state && !state.success ? (
          <Alert variant="error" className="mb-4">
            {state.error}
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="manual-charge-lease">
              Lease
            </label>
            <select
              id="manual-charge-lease"
              name="leaseId"
              className="domus-input h-10 w-full rounded-md px-3 text-sm"
              defaultValue={leases[0]?.id ?? ""}
              required
              title="Select the lease this charge belongs to."
            >
              {leases.map((lease) => (
                <option key={lease.id} value={lease.id}>
                  {lease.tenantLabel} • {lease.propertyLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-charge-amount">
                Amount
              </label>
              <Input
                id="manual-charge-amount"
                name="amountDollars"
                type="number"
                min={0.01}
                step="0.01"
                placeholder="75.00"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-charge-date">
                Due Date
              </label>
              <Input
                id="manual-charge-date"
                name="dueDate"
                type="date"
                defaultValue={defaultDueDate}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="manual-charge-category">
              Category
            </label>
            <select
              id="manual-charge-category"
              name="category"
              className="domus-input h-10 w-full rounded-md px-3 text-sm"
              defaultValue="other"
              title="Choose the charge category."
            >
              {CHARGE_CATEGORY_VALUES.map((category) => (
                <option key={category} value={category}>
                  {chargeCategoryLabel(category)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="manual-charge-notes">
              Description / Notes
            </label>
            <Textarea
              id="manual-charge-notes"
              name="notes"
              rows={3}
              placeholder="Key replacement fee, utility true-up, or other one-off charge."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} title="Cancel charge creation.">
              Cancel
            </Button>
            <SubmitButton title="Create this manual charge.">Create Charge</SubmitButton>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
