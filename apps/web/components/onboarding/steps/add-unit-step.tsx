"use client";

import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface AddUnitStepProps {
  propertyId: string;
  propertyName: string;
  onCreateUnit: StatefulAction;
  onComplete: () => void;
  onSkip: () => void;
}

export function AddUnitStep({ propertyId, propertyName, onCreateUnit, onComplete, onSkip }: AddUnitStepProps) {
  const [state, formAction] = useFormState(async (prev: ActionState, formData: FormData) => {
    const result = await onCreateUnit(prev, formData);
    if (result?.success) {
      onComplete();
    }
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-900">Add your first unit</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Add a unit to <span className="font-medium text-zinc-700">{propertyName}</span>.
        </p>
      </div>

      {state && !state.success && state.error && (
        <Alert variant="error">{state.error}</Alert>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />

        <div>
          <label htmlFor="wiz-unitNumber" className="mb-1 block text-sm font-medium text-zinc-700">
            Unit Number
          </label>
          <Input id="wiz-unitNumber" name="unitNumber" placeholder="e.g. 101, A, Ground Floor" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="wiz-bedrooms" className="mb-1 block text-sm font-medium text-zinc-700">
              Bedrooms
            </label>
            <Input id="wiz-bedrooms" name="bedrooms" type="number" min={0} defaultValue={1} required />
          </div>
          <div>
            <label htmlFor="wiz-bathrooms" className="mb-1 block text-sm font-medium text-zinc-700">
              Bathrooms
            </label>
            <Input id="wiz-bathrooms" name="bathrooms" type="number" min={0} defaultValue={1} required />
          </div>
        </div>

        <div>
          <label htmlFor="wiz-monthlyRent" className="mb-1 block text-sm font-medium text-zinc-700">
            Monthly Rent ($)
          </label>
          <Input id="wiz-monthlyRent" name="monthlyRentDollars" type="number" min={1} step="0.01" placeholder="1500" required />
        </div>

        <SubmitButton className="w-full" title="Create this unit.">
          Add Unit
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
