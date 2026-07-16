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

interface RentCollectionAccountStatus {
  accountId: string;
  accountName: string;
  isConnected: boolean;
  activePropertyCount: number;
  propertyNames: string[];
}

interface BankSettingsProps {
  stripeConnected: boolean;
  stripeAccountId: string | null;
  role: "owner" | "manager";
  onGetExpressDashboardUrl?: StatefulAction;
  rentCollectionConnected?: boolean;
  rentCollectionConnectHref?: string;
  rentCollectionAccounts?: RentCollectionAccountStatus[];
  legacyProfileTarget?: boolean;
  profileConnected?: boolean;
}

export function BankSettings({
  stripeConnected,
  stripeAccountId,
  role,
  onGetExpressDashboardUrl,
  rentCollectionConnected = false,
  rentCollectionConnectHref = "/connect/onboard",
  rentCollectionAccounts = [],
  legacyProfileTarget = false,
  profileConnected = false
}: BankSettingsProps) {
  const [state, action] = useFormState(onGetExpressDashboardUrl ?? unavailableAction, null);
  const connectedAccounts = rentCollectionAccounts.filter((account) => account.isConnected);
  const showProfileManage = profileConnected && (legacyProfileTarget || connectedAccounts.length === 0);

  useEffect(() => {
    if (state?.success && state.url) {
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);

  if (role === "owner") {
    return (
      <div className="space-y-4">
        <Alert variant={rentCollectionConnected ? "success" : "warning"} className="rounded-xl px-4 py-4">
          <p className={`text-sm font-semibold ${rentCollectionConnected ? "text-emerald-900" : "text-amber-900"}`}>
            {rentCollectionConnected ? "Rent payments are set up." : "Set up rent payments."}
          </p>
          <p className={`mt-1 text-sm ${rentCollectionConnected ? "text-emerald-700" : "text-amber-700"}`}>
            {rentCollectionConnected
              ? "Stripe is ready to collect rent for your properties."
              : "Finish Stripe setup so your properties can collect rent."}
          </p>
          {!rentCollectionConnected ? (
            <a
              href={rentCollectionConnectHref}
              className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              Set up rent payments
            </a>
          ) : null}
        </Alert>
        {connectedAccounts.length > 0 || showProfileManage ? (
          <div className="space-y-3">
            {connectedAccounts.map((account) => {
              const extraPropertyCount = account.activePropertyCount - account.propertyNames.length;
              const propertySummary =
                account.activePropertyCount === 0 || account.propertyNames.length === 0
                  ? "No active properties yet."
                  : extraPropertyCount > 0
                    ? `${account.propertyNames.join(", ")} and ${extraPropertyCount} more`
                    : account.propertyNames.join(", ");

              return (
                <div
                  key={account.accountId}
                  className="rounded-xl border border-border/60 bg-card px-4 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{account.accountName}</p>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Connected for rent.
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{propertySummary}</p>
                    </div>
                    <form action={action}>
                      <input type="hidden" name="accountId" value={account.accountId} />
                      <SubmitButton title="Open the Stripe dashboard for this rent account in a new tab.">
                        Manage on Stripe
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
            {showProfileManage ? (
              <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Your personal properties</p>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Connected for rent.
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Stripe is ready to collect rent for properties tied to your profile.
                    </p>
                    {stripeAccountId ? (
                      <p className="text-xs text-muted-foreground">Account ID: {stripeAccountId}</p>
                    ) : null}
                  </div>
                  <form action={action}>
                    <SubmitButton title="Open your Stripe dashboard in a new tab.">
                      Manage on Stripe
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {state && !state.success ? (
          <Alert variant="error">
            {state.error}
          </Alert>
        ) : null}
      </div>
    );
  }

  if (stripeConnected) {
    return (
      <div className="space-y-4">
        <Alert variant="success" className="rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">Management fee payments are set up.</p>
          <p className="mt-1 text-sm text-emerald-700">
            Stripe is ready to send your management fee payments.
          </p>
          {stripeAccountId ? (
            <p className="mt-2 text-xs text-emerald-800">Account ID: {stripeAccountId}</p>
          ) : null}
        </Alert>
        <form action={action}>
          <SubmitButton title="Open your Stripe dashboard in a new tab.">
            Manage on Stripe
          </SubmitButton>
        </form>
        {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
      </div>
    );
  }

  return (
    <Alert variant="warning" className="rounded-xl px-4 py-4">
      <p className="text-sm font-semibold text-amber-900">Set up management fee payments.</p>
      <p className="mt-1 text-sm text-amber-700">
        Finish Stripe setup so you can receive management fee payments.
      </p>
      <a
        href="/connect/onboard"
        className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Set up now
      </a>
    </Alert>
  );
}
