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
import { CHARGE_CATEGORY_VALUES, chargeCategoryLabel, type ChargeCategory, type ChargeStatus } from "@/lib/charge-audit";
import { formatCurrency, formatDate } from "@/lib/format";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface EditableChargeView {
  id: string;
  amountCents: number;
  dueDate: string;
  status: ChargeStatus;
  category: ChargeCategory;
  notes?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
}

interface ChargeEditModalProps {
  charge: EditableChargeView | null;
  open: boolean;
  onClose: () => void;
  onSave: StatefulAction;
}

const STATUS_OPTIONS: Array<{ value: ChargeStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "late", label: "Late" },
  { value: "waived", label: "Waived" }
];

export function ChargeEditModal({ charge, open, onClose, onSave }: ChargeEditModalProps) {
  const [state, formAction] = useFormState(onSave, null);

  useEffect(() => {
    if (state?.success) {
      onClose();
    }
  }, [onClose, state]);

  if (!open || !charge) {
    return null;
  }

  return (
    <ModalOverlay open={open} onClose={onClose}>
      <div className="domus-card max-h-[85vh] overflow-y-auto p-6 scroll-smooth [-webkit-overflow-scrolling:touch]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Edit Charge</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(charge.amountCents)} due {formatDate(charge.dueDate)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClose} title="Close this editor.">
            Cancel
          </Button>
        </div>

        {state?.success ? (
          <Alert variant="success" className="mb-4">
            {state.message ?? "Charge updated."}
          </Alert>
        ) : null}
        {state && !state.success ? (
          <Alert variant="error" className="mb-4">
            {state.error}
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="chargeId" value={charge.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-amount">
                Amount
              </label>
              <Input
                id="charge-edit-amount"
                name="amountDollars"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={(charge.amountCents / 100).toFixed(2)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-due-date">
                Due Date
              </label>
              <Input id="charge-edit-due-date" name="dueDate" type="date" defaultValue={charge.dueDate} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-category">
                Category
              </label>
              <select
                id="charge-edit-category"
                name="category"
                defaultValue={charge.category}
                className="domus-input h-10 w-full rounded-md px-3 text-sm"
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
              <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-status">
                Status
              </label>
              <select
                id="charge-edit-status"
                name="status"
                defaultValue={charge.status}
                className="domus-input h-10 w-full rounded-md px-3 text-sm"
                title="Choose the charge status."
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-notes">
              Notes
            </label>
            <Textarea
              id="charge-edit-notes"
              name="notes"
              rows={3}
              defaultValue={charge.notes ?? ""}
              placeholder="Describe the charge or adjustment."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="charge-edit-reason">
              Reason for Edit
            </label>
            <Textarea
              id="charge-edit-reason"
              name="reason"
              rows={3}
              required
              placeholder="Why are you changing this charge?"
            />
          </div>

          {charge.editedCount ? (
            <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Edited {charge.editedCount} time{charge.editedCount === 1 ? "" : "s"}
              {charge.latestEditedByName && charge.latestEditedAt
                ? ` • Last updated by ${charge.latestEditedByName} on ${formatDate(charge.latestEditedAt)}`
                : ""}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} title="Cancel these changes.">
              Cancel
            </Button>
            <SubmitButton title="Save charge changes.">Save Charge</SubmitButton>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
