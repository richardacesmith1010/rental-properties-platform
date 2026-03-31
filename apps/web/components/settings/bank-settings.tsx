"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Bank account management is unavailable."
});

interface BankSettingsProps {
  stripeConnected: boolean;
  stripeAccountId: string | null;
  role: "owner" | "manager";
  onGetExpressDashboardUrl?: StatefulAction;
  llcMembershipDetected?: boolean;
  llcPayoutConnected?: boolean;
  llcAccountId?: string | null;
  llcAccountName?: string | null;
}

export function BankSettings({
  stripeConnected,
  stripeAccountId,
  role,
  onGetExpressDashboardUrl,
  llcMembershipDetected = false,
  llcPayoutConnected = false,
  llcAccountId = null,
  llcAccountName = null
}: BankSettingsProps) {
  const [state, action] = useFormState(onGetExpressDashboardUrl ?? unavailableAction, null);
  const connectHref = llcMembershipDetected
    ? llcAccountId
      ? `/connect/onboard?accountId=${encodeURIComponent(llcAccountId)}&memberPayout=true`
      : "/connect/onboard?memberPayout=true"
    : "/connect/onboard";
  const isConnected = llcMembershipDetected ? llcPayoutConnected : stripeConnected;

  useEffect(() => {
    if (state?.success && state.url) {
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);

  if (isConnected) {
    return (
      <div className="space-y-4">
        <Alert variant="success" className="rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">
            {llcMembershipDetected ? "Your payout account is connected ✓" : "Bank Account Connected ✓"}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            {llcMembershipDetected
              ? llcAccountName
                ? `You're ready to receive your share of rent from ${llcAccountName}.`
                : "You're ready to receive your rent payouts."
              : `Your bank account is ready to receive ${role === "owner" ? "rent payments" : "management fee payments"}.`}
          </p>
          {!llcMembershipDetected && stripeAccountId ? (
            <p className="mt-2 text-xs text-emerald-800">Account ID: {stripeAccountId}</p>
          ) : null}
        </Alert>
        {llcMembershipDetected ? (
          <a
            href={connectHref}
            className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            Manage on Stripe
          </a>
        ) : (
          <>
            <form action={action}>
              <SubmitButton title="Open your payout dashboard in a new tab.">
                Manage on Stripe
              </SubmitButton>
            </form>
            {state && !state.success ? (
              <Alert variant="error">
                {state.error}
              </Alert>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Alert variant="warning" className="rounded-xl px-4 py-4">
      <p className="text-sm font-semibold text-amber-900">
        {llcMembershipDetected ? "Connect your bank to receive rent payouts" : "Connect your bank account to receive payments"}
      </p>
      <p className="mt-1 text-sm text-amber-700">
        {llcMembershipDetected
          ? llcAccountName
            ? `Connect your bank account to receive your share of rent from ${llcAccountName}.`
            : "Connect your bank account to receive your share of rent."
          : role === "owner"
            ? "Connect your bank account so rent payments go straight to you."
            : "Connect your bank account so management fee payments go straight to you."}
      </p>
      <a
        href={connectHref}
        className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Connect Bank Account
      </a>
    </Alert>
  );
}
