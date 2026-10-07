"use client";

import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ChargeRowData } from "@/components/dashboard/charge-row";

export function ManualPaymentForm({
  charge,
  action
}: {
  charge: Pick<ChargeRowData, "id" | "amountCents">;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="chargeId" value={charge.id} />
      <div className="space-y-1">
        <label className="block text-xs font-medium text-[var(--muted)]" htmlFor={`manual-payment-amount-${charge.id}`}>
          Amount
        </label>
        <Input
          id={`manual-payment-amount-${charge.id}`}
          name="amountDollars"
          type="number"
          min={0.01}
          step="0.01"
          defaultValue={(charge.amountCents / 100).toFixed(2)}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-[var(--muted)]" htmlFor={`manual-payment-method-${charge.id}`}>
          Method
        </label>
        <select
          id={`manual-payment-method-${charge.id}`}
          name="method"
          className="domus-input h-11 w-full rounded-md px-3 text-sm"
          defaultValue="cash"
          title="Select manual payment method."
        >
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="ach">Bank transfer</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-[var(--muted)]" htmlFor={`manual-payment-reference-${charge.id}`}>
          Reference Note
        </label>
        <Input id={`manual-payment-reference-${charge.id}`} name="referenceNote" placeholder="Optional" />
      </div>
      <div className="flex items-end">
        <SubmitButton size="sm" variant="outline" className="h-11" title="Record this manual payment.">
          Save Payment
        </SubmitButton>
      </div>
    </form>
  );
}
