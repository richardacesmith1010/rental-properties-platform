"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Stripe account management is unavailable."
});

interface BankSettingsProps {
  stripeConnected: boolean;
  stripeAccountId: string | null;
  role: "owner" | "manager";
  onGetExpressDashboardUrl?: StatefulAction;
}

export function BankSettings({
  stripeConnected,
  stripeAccountId,
  role,
  onGetExpressDashboardUrl
}: BankSettingsProps) {
  const [state, action] = useFormState(onGetExpressDashboardUrl ?? unavailableAction, null);

  useEffect(() => {
    if (state?.success && state.url) {
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);

  if (stripeConnected) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">Bank Account Connected ✓</p>
          <p className="mt-1 text-sm text-emerald-700">
            Your Stripe Express account is ready to receive {role === "owner" ? "rent payments" : "management fee payments"}.
          </p>
          {stripeAccountId ? (
            <p className="mt-2 text-xs text-emerald-800">Account ID: {stripeAccountId}</p>
          ) : null}
        </div>
        <form action={action}>
          <SubmitButton title="Open your Stripe Express dashboard in a new tab.">
            Manage on Stripe
          </SubmitButton>
        </form>
        {state && !state.success ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-semibold text-amber-900">Connect your bank account to receive payments</p>
      <p className="mt-1 text-sm text-amber-700">
        {role === "owner"
          ? "Connect Stripe Express so tenant rent payments route directly to your bank account."
          : "Connect Stripe Express so your management fee transfers can be paid out to your bank account."}
      </p>
      <a
        href="/connect/onboard"
        className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Connect Bank Account
      </a>
    </div>
  );
}
