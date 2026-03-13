"use client";

import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface InviteTenantStepProps {
  propertyId: string;
  onInviteTenant: StatefulAction;
  onComplete: () => void;
  onSkip: () => void;
}

export function InviteTenantStep({ propertyId, onInviteTenant, onComplete, onSkip }: InviteTenantStepProps) {
  const [state, formAction] = useFormState(async (prev: ActionState, formData: FormData) => {
    const result = await onInviteTenant(prev, formData);
    if (result?.success) {
      onComplete();
    }
    return result;
  }, null);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-900">Invite a tenant</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Send an invite so your tenant can sign up and view their dashboard.
        </p>
      </div>

      {state && !state.success && state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />

        <div>
          <label htmlFor="wiz-inviteEmail" className="mb-1 block text-sm font-medium text-zinc-700">
            Tenant Email
          </label>
          <Input id="wiz-inviteEmail" name="email" type="email" placeholder="tenant@example.com" required />
        </div>

        <div>
          <label htmlFor="wiz-inviteName" className="mb-1 block text-sm font-medium text-zinc-700">
            Full Name
          </label>
          <Input id="wiz-inviteName" name="fullName" placeholder="Jane Doe" required />
        </div>

        <SubmitButton className="w-full" title="Send the invitation.">
          Send Invite
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
