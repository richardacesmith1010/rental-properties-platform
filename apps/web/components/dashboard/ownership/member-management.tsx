"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/shared/submit-button";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { StatefulAction } from "../types";

const unavailableConnectAction: StatefulAction = async () => ({
  success: false,
  error: "Bank connection is unavailable for this account."
});

export function OwnershipAccountSummary({
  account,
  isActive
}: {
  account: OwnershipAccountDTO;
  isActive: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-zinc-900">{account.displayName}</p>
        <Badge variant="outline" className="capitalize">
          {account.accountType}
        </Badge>
        {isActive ? <Badge variant="default">Active</Badge> : null}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 capitalize">
        {account.memberCount} member{account.memberCount === 1 ? "" : "s"} • distribution{" "}
        {account.distributionMode.replace(/_/g, " ")}
      </p>
    </div>
  );
}

export function OwnershipAccountStripeControl({
  account,
  onInitiateAccountStripeConnect
}: {
  account: OwnershipAccountDTO;
  onInitiateAccountStripeConnect?: StatefulAction;
}) {
  const [connectState, connectAction] = useFormState(
    onInitiateAccountStripeConnect ?? unavailableConnectAction,
    null
  );

  useEffect(() => {
    if (connectState?.success && connectState.url) {
      window.location.assign(connectState.url);
    }
  }, [connectState]);

  if (account.stripeConnected) {
    return <Badge variant="success">Bank Connected</Badge>;
  }

  if (account.stripeAccountId) {
    return <Badge variant="warning">Pending</Badge>;
  }

  if (!onInitiateAccountStripeConnect) {
    return null;
  }

  return (
    <form action={connectAction} className="space-y-2">
      <input type="hidden" name="accountId" value={account.id} />
      <SubmitButton
        size="sm"
        variant="outline"
        title={`Connect a bank account for ${account.displayName}.`}
      >
        Connect Bank Account
      </SubmitButton>
      {connectState && !connectState.success ? (
        <Alert variant="error" className="text-xs font-normal">
          {connectState.error}
        </Alert>
      ) : null}
    </form>
  );
}
