"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/format";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface BankBalanceCardProps {
  bankName: string | null;
  bankMask: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
  onRefreshBalance: StatefulAction;
  onDisconnect: StatefulAction;
  accountId: string;
  className?: string;
  showDisconnect?: boolean;
}

export function BankBalanceCard({
  bankName,
  bankMask,
  balanceCents,
  balanceUpdatedAt,
  onRefreshBalance,
  onDisconnect,
  accountId,
  className,
  showDisconnect = true
}: BankBalanceCardProps) {
  const [refreshState, refreshAction] = useFormState(onRefreshBalance, null);
  const [disconnectState, disconnectAction] = useFormState(onDisconnect, null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!disconnectState?.success) {
      return;
    }
    setShowDisconnectConfirm(false);
    setConfirmation("");
  }, [disconnectState]);

  const balanceLabel =
    typeof balanceCents === "number" ? formatCurrency(balanceCents) : "Balance unavailable";
  const updatedLabel = balanceUpdatedAt
    ? `Updated ${formatRelativeTime(balanceUpdatedAt)}`
    : "Balance has not been refreshed yet.";

  return (
    <div className={cn("mt-3 rounded-xl border border-border bg-card px-4 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {bankName ?? "Connected bank"}
            {bankMask ? ` ••••${bankMask}` : ""}
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{balanceLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{updatedLabel}</p>
        </div>
        <form action={refreshAction} className="space-y-2">
          <input type="hidden" name="accountId" value={accountId} />
          <SubmitButton
            size="sm"
            variant="outline"
            title="Refresh the linked bank balance from Plaid."
          >
            Refresh
          </SubmitButton>
          {refreshState && !refreshState.success ? (
            <Alert variant="error" className="text-xs font-normal">
              {refreshState.error}
            </Alert>
          ) : null}
          {refreshState?.success && refreshState.message ? (
            <Alert variant="success" className="text-xs font-normal">
              {refreshState.message}
            </Alert>
          ) : null}
        </form>
      </div>

      {showDisconnect ? (
        <div className="mt-3 border-t border-border pt-3">
          {!showDisconnectConfirm ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowDisconnectConfirm(true)}
              title="Disconnect this Plaid-linked bank account."
            >
              Disconnect
            </Button>
          ) : (
            <form action={disconnectAction} className="space-y-2">
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="confirmation" value={confirmation} />
              <p className="text-xs text-muted-foreground">Type DISCONNECT to remove this linked bank account.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="DISCONNECT"
                  className="h-9 max-w-[11rem]"
                  title='Type "DISCONNECT" to confirm removing this linked bank account.'
                />
                <SubmitButton
                  size="sm"
                  variant="destructive"
                  disabled={confirmation !== "DISCONNECT"}
                  title="Confirm disconnecting this Plaid-linked bank account."
                >
                  Confirm Disconnect
                </SubmitButton>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowDisconnectConfirm(false);
                    setConfirmation("");
                  }}
                  title="Cancel disconnecting this bank account."
                >
                  Cancel
                </Button>
              </div>
              {disconnectState && !disconnectState.success ? (
                <Alert variant="error" className="text-xs font-normal">
                  {disconnectState.error}
                </Alert>
              ) : null}
              {disconnectState?.success && disconnectState.message ? (
                <Alert variant="success" className="text-xs font-normal">
                  {disconnectState.message}
                </Alert>
              ) : null}
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
