"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface AddLeaseStepProps {
  unitId: string;
  monthlyRentDollars: number;
  onCreateLease: StatefulAction;
  onComplete: () => void;
  onSkip: () => void;
}

function defaultStartDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultEndDate() {
  const now = new Date();
  const end = new Date(now.getFullYear() + 1, now.getMonth(), 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

export function AddLeaseStep({ unitId, monthlyRentDollars, onCreateLease, onComplete, onSkip }: AddLeaseStepProps) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await onCreateLease(prev, formData);
    if (result?.success) {
      onComplete();
    }
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-900">Create a lease</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Set up a lease for your new unit. You can always edit this later.
        </p>
      </div>

      {state && !state.success && state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="unitId" value={unitId} />

        <div>
          <label htmlFor="wiz-tenantEmail" className="mb-1 block text-sm font-medium text-zinc-700">
            Tenant Email
          </label>
          <Input id="wiz-tenantEmail" name="tenantProfileId" placeholder="tenant@example.com" required />
          <p className="mt-0.5 text-xs text-zinc-400">
            The tenant must have an account. Enter their profile ID or email.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="wiz-startDate" className="mb-1 block text-sm font-medium text-zinc-700">
              Start Date
            </label>
            <Input id="wiz-startDate" name="startDate" type="date" defaultValue={defaultStartDate()} required />
          </div>
          <div>
            <label htmlFor="wiz-endDate" className="mb-1 block text-sm font-medium text-zinc-700">
              End Date
            </label>
            <Input id="wiz-endDate" name="endDate" type="date" defaultValue={defaultEndDate()} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="wiz-leaseRent" className="mb-1 block text-sm font-medium text-zinc-700">
              Monthly Rent ($)
            </label>
            <Input
              id="wiz-leaseRent"
              name="monthlyRentDollars"
              type="number"
              min={1}
              step="0.01"
              defaultValue={monthlyRentDollars}
              required
            />
          </div>
          <div>
            <label htmlFor="wiz-dueDay" className="mb-1 block text-sm font-medium text-zinc-700">
              Due Day of Month
            </label>
            <Input id="wiz-dueDay" name="dueDayOfMonth" type="number" min={1} max={28} defaultValue={1} required />
          </div>
        </div>

        <div>
          <label htmlFor="wiz-deposit" className="mb-1 block text-sm font-medium text-zinc-700">
            Security Deposit ($)
          </label>
          <Input id="wiz-deposit" name="depositDollars" type="number" min={0} step="0.01" defaultValue={0} />
        </div>

        <SubmitButton className="w-full" title="Create this lease.">
          Create Lease
        </SubmitButton>
      </form>

      <button
        type="button"
        onClick={onSkip}
        className="block w-full text-center text-sm text-zinc-400 hover:text-zinc-600"
      >
        Skip for now
      </button>
    </div>
  );
}
