"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { SubmitButton } from "@/components/shared/submit-button";
import { cn, formatCurrency, formatDateTime } from "@/lib/format";
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

  return (
    <div className={cn("domus-card mt-3 px-4 py-4 shadow-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {bankName ?? "Connected bank"}
            {bankMask ? ` ••••${bankMask}` : ""}
          </p>
          <p className="tabular-nums mt-2 text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]">
            {balanceLabel}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {balanceUpdatedAt ? (
              <>
                Updated{" "}
                <RelativeTime
                  value={balanceUpdatedAt}
                  fallback="dateTime"
                  title={formatDateTime(balanceUpdatedAt)}
                />
              </>
            ) : (
              "Balance has not been refreshed yet."
            )}
          </p>
        </div>
        <form action={refreshAction} className="w-full space-y-2 sm:w-auto">
          <input type="hidden" name="accountId" value={accountId} />
          <SubmitButton
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
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
        <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] pt-3">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="DISCONNECT"
                  className="h-9 w-full sm:max-w-[11rem]"
                  title='Type "DISCONNECT" to confirm removing this linked bank account.'
                />
                <SubmitButton
                  size="sm"
                  variant="destructive"
                  disabled={confirmation !== "DISCONNECT"}
                  className="w-full sm:w-auto"
                  title="Confirm disconnecting this Plaid-linked bank account."
                >
                  Confirm Disconnect
                </SubmitButton>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
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
