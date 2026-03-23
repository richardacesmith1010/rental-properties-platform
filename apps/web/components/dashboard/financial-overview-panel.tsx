"use client";

import { Landmark, Loader2, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { cn, formatRelativeTime } from "@/lib/format";
import { BankBalanceCard } from "@/components/dashboard/bank-balance-card";
import { PlaidLinkButton } from "@/components/dashboard/plaid-link-button";
import { DomusFinancialsCard } from "@/components/dashboard/domus-financials-card";
import type { StatefulAction } from "./types";

export type FinancialOverviewTab = "bank" | "domus" | "both";

const FINANCE_VIEW_STORAGE_KEY = "domus-finance-view";
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const noopRefreshAction: StatefulAction = async () => ({
  success: false,
  error: "Bank balance refresh is unavailable right now."
});

export interface FinancialOverviewPanelProps {
  accountId: string | null;
  plaidConnected: boolean;
  bankName?: string | null;
  bankMask?: string | null;
  balanceCents?: number | null;
  balanceUpdatedAt?: string | null;
  monthlyCollectedCents: number;
  monthlyOutstandingCents: number;
  monthlyExpensesCents: number;
  netIncomeCents: number;
  ytdIncomeCents: number;
  ytdExpensesCents: number;
  collectionRate: number;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
}

export function isPlaidBalanceStale(balanceUpdatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!balanceUpdatedAt) {
    return true;
  }

  const updatedAtMs = new Date(balanceUpdatedAt).getTime();
  if (Number.isNaN(updatedAtMs)) {
    return true;
  }

  return now - updatedAtMs > FOUR_HOURS_MS;
}

export function resolveInitialFinanceView(
  storedValue: string | null,
  plaidConnected: boolean
): FinancialOverviewTab {
  if (storedValue === "both") {
    return plaidConnected ? "both" : "domus";
  }
  if (storedValue === "bank" || storedValue === "domus") {
    return storedValue;
  }
  return plaidConnected ? "bank" : "domus";
}

function FinanceViewButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
      title={`Show the ${label} finance view.`}
    >
      {label}
    </button>
  );
}

function UnavailableBankState({
  canConnect,
  accountId,
  onInitiatePlaidLink,
  onCompletePlaidLink
}: {
  canConnect: boolean;
  accountId: string | null;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
}) {
  if (canConnect && accountId && onInitiatePlaidLink && onCompletePlaidLink) {
    return (
      <PlaidLinkButton
        accountId={accountId}
        onInitiatePlaidLink={onInitiatePlaidLink}
        onCompletePlaidLink={onCompletePlaidLink}
        className="mt-0"
        title="Connect your bank"
        description="See real-time balances from your connected bank account alongside Domus rent collection."
      />
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-card/70 p-5">
      <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Landmark className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            {canConnect ? "Connect your bank" : "Bank data unavailable"}
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            An ownership account is required before Domus can show bank balances here.
          </p>
        </div>
      </div>
    </div>
  );
}

export function FinancialOverviewPanel({
  accountId,
  plaidConnected,
  bankName = null,
  bankMask = null,
  balanceCents = null,
  balanceUpdatedAt = null,
  monthlyCollectedCents,
  monthlyOutstandingCents,
  monthlyExpensesCents,
  netIncomeCents,
  ytdIncomeCents,
  ytdExpensesCents,
  collectionRate,
  onInitiatePlaidLink,
  onCompletePlaidLink,
  onRefreshPlaidBalance,
  onDisconnectPlaid
}: FinancialOverviewPanelProps) {
  const [activeTab, setActiveTab] = useState<FinancialOverviewTab>(
    resolveInitialFinanceView(null, plaidConnected)
  );
  const [autoRefreshState, autoRefreshAction] = useFormState(
    onRefreshPlaidBalance ?? noopRefreshAction,
    null
  );
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const autoRefreshFormRef = useRef<HTMLFormElement | null>(null);
  const hasTriggeredAutoRefresh = useRef(false);
  const staleBalance = plaidConnected && isPlaidBalanceStale(balanceUpdatedAt);
  const canConnectBank = Boolean(accountId && onInitiatePlaidLink && onCompletePlaidLink);
  const canRenderBankCard = Boolean(
    plaidConnected && accountId && onRefreshPlaidBalance && onDisconnectPlaid
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(FINANCE_VIEW_STORAGE_KEY);
    setActiveTab(resolveInitialFinanceView(storedValue, plaidConnected));
  }, [plaidConnected]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(FINANCE_VIEW_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!staleBalance || !accountId || !onRefreshPlaidBalance || hasTriggeredAutoRefresh.current) {
      return;
    }
    if (!autoRefreshFormRef.current) {
      return;
    }

    hasTriggeredAutoRefresh.current = true;
    setIsAutoRefreshing(true);
    autoRefreshFormRef.current.requestSubmit();
  }, [accountId, onRefreshPlaidBalance, staleBalance]);

  useEffect(() => {
    if (!autoRefreshState) {
      return;
    }

    setIsAutoRefreshing(false);
  }, [autoRefreshState]);

  const autoRefreshWarning =
    autoRefreshState && !autoRefreshState.success && staleBalance
      ? `Bank refresh failed. Showing the last known balance${
          balanceUpdatedAt ? ` from ${formatRelativeTime(balanceUpdatedAt)}` : ""
        }.`
      : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Financial Overview</h3>
              <p className="text-sm text-muted-foreground">
                Toggle between live bank balances and Domus rent performance.
              </p>
            </div>
          </div>
          {isAutoRefreshing ? (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Refreshing bank balance…</span>
            </div>
          ) : null}
        </div>

        <div className="inline-flex w-fit rounded-lg border border-border bg-muted/50 p-1">
          <FinanceViewButton
            active={activeTab === "bank"}
            label="Bank"
            onClick={() => setActiveTab("bank")}
          />
          <FinanceViewButton
            active={activeTab === "domus"}
            label="Domus"
            onClick={() => setActiveTab("domus")}
          />
          {plaidConnected ? (
            <FinanceViewButton
              active={activeTab === "both"}
              label="Both"
              onClick={() => setActiveTab("both")}
            />
          ) : null}
        </div>
      </div>

      {accountId && onRefreshPlaidBalance ? (
        <form action={autoRefreshAction} ref={autoRefreshFormRef} className="hidden">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="refreshMode" value="auto" />
        </form>
      ) : null}

      {autoRefreshWarning ? (
        <Alert variant="warning" className="mt-4 text-xs font-normal">
          {autoRefreshWarning}
        </Alert>
      ) : null}

      <div className="mt-4 space-y-4">
        {activeTab === "bank" ? (
          canRenderBankCard ? (
            <BankBalanceCard
              bankName={bankName}
              bankMask={bankMask}
              balanceCents={balanceCents}
              balanceUpdatedAt={balanceUpdatedAt}
              onRefreshBalance={onRefreshPlaidBalance!}
              onDisconnect={onDisconnectPlaid!}
              accountId={accountId!}
              className="mt-0"
              showDisconnect={false}
            />
          ) : (
            <UnavailableBankState
              canConnect={canConnectBank}
              accountId={accountId}
              onInitiatePlaidLink={onInitiatePlaidLink}
              onCompletePlaidLink={onCompletePlaidLink}
            />
          )
        ) : null}

        {activeTab === "domus" ? (
          <DomusFinancialsCard
            monthlyCollectedCents={monthlyCollectedCents}
            monthlyOutstandingCents={monthlyOutstandingCents}
            monthlyExpensesCents={monthlyExpensesCents}
            netIncomeCents={netIncomeCents}
            ytdIncomeCents={ytdIncomeCents}
            ytdExpensesCents={ytdExpensesCents}
            collectionRate={collectionRate}
          />
        ) : null}

        {activeTab === "both" && plaidConnected ? (
          <>
            {canRenderBankCard ? (
              <BankBalanceCard
                bankName={bankName}
                bankMask={bankMask}
                balanceCents={balanceCents}
                balanceUpdatedAt={balanceUpdatedAt}
                onRefreshBalance={onRefreshPlaidBalance!}
                onDisconnect={onDisconnectPlaid!}
                accountId={accountId!}
                className="mt-0"
                showDisconnect={false}
              />
            ) : (
              <UnavailableBankState
                canConnect={canConnectBank}
                accountId={accountId}
                onInitiatePlaidLink={onInitiatePlaidLink}
                onCompletePlaidLink={onCompletePlaidLink}
              />
            )}
            <DomusFinancialsCard
              monthlyCollectedCents={monthlyCollectedCents}
              monthlyOutstandingCents={monthlyOutstandingCents}
              monthlyExpensesCents={monthlyExpensesCents}
              netIncomeCents={netIncomeCents}
              ytdIncomeCents={ytdIncomeCents}
              ytdExpensesCents={ytdExpensesCents}
              collectionRate={collectionRate}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
