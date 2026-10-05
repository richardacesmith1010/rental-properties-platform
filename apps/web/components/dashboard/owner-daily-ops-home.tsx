"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ManualPaymentForm, type ChargeRowData } from "@/components/dashboard/charge-row";
import { FinancialOverviewPanel } from "@/components/dashboard/financial-overview-panel";
import { LlcSetupPrompt } from "@/components/dashboard/llc-setup-prompt";
import { OwnerBankCard } from "@/components/dashboard/owner-bank-card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OwnerBankCardState } from "@/lib/owner-bank-status";
import type { StatefulAction } from "./types";

interface OwnerHomeSummary {
  lateCharges: ChargeRowData[];
  openRepairCount: number;
  newMessageCount: number;
  collectedCents: number;
  dueCents: number;
  homeCount: number;
  rentedHomeCount: number;
  nextDueDate: string | null;
  nextDueAmountCents: number;
  nextDueTenantCount: number;
}

interface OwnerDailyOpsHomeProps {
  bankState: OwnerBankCardState;
  summary: OwnerHomeSummary;
  onOpenSection: (sectionId: string) => void;
  onSendBatchPaymentReminder?: StatefulAction;
  onRecordManualPayment?: StatefulAction;
  financialOverview: {
    accountId: string | null; plaidConnected: boolean; bankName: string | null;
    bankMask: string | null; balanceCents: number | null; balanceUpdatedAt: string | null;
    monthlyCollectedCents: number; monthlyOutstandingCents: number; monthlyExpensesCents: number;
    netIncomeCents: number; ytdIncomeCents: number; ytdExpensesCents: number; collectionRate: number;
  };
  llcSetupPrompt?: {
    accountName: string; memberCount: number; propertyCount: number;
    onInviteMembers: () => void; onAddProperty: () => void;
  } | null;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({ success: false, error: "This action is unavailable." });

function SummaryTile({ title, value, detail, progress }: {
  title: string; value: string; detail?: string; progress?: number;
}) {
  return (
    <div className="domus-card min-w-0 p-4 sm:p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
      {detail ? <p className="mt-1 text-sm text-[var(--muted)]">{detail}</p> : null}
      {progress != null ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function OwnerDailyOpsHome({
  bankState, summary, onOpenSection, onSendBatchPaymentReminder, onRecordManualPayment,
  financialOverview, llcSetupPrompt, onInitiatePlaidLink, onCompletePlaidLink,
  onRefreshPlaidBalance, onDisconnectPlaid
}: OwnerDailyOpsHomeProps) {
  const router = useRouter();
  const [paymentChargeId, setPaymentChargeId] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [paymentState, paymentAction] = useFormState(onRecordManualPayment ?? unavailableAction, null);
  const dueProgress = summary.dueCents > 0
    ? Math.min(100, Math.round((summary.collectedCents / summary.dueCents) * 100))
    : 0;

  const sendReminder = (chargeId: string) => {
    if (!onSendBatchPaymentReminder) {
      onOpenSection("charges");
      return;
    }
    startSending(async () => {
      const formData = new FormData();
      formData.append("chargeIds", chargeId);
      const result = await onSendBatchPaymentReminder(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to send this reminder.");
        return;
      }
      toast.success(result.message ?? "Reminder sent.");
      router.refresh();
    });
  };

  useEffect(() => {
    if (!paymentState?.success) {
      return;
    }

    toast.success(paymentState.message ?? "Payment recorded.");
    setPaymentChargeId(null);
    router.refresh();
  }, [paymentState, router]);

  return (
    <div className="flex min-h-full flex-col gap-5 py-1">
      <OwnerBankCard state={bankState} />

      {llcSetupPrompt ? (
        <LlcSetupPrompt {...llcSetupPrompt} />
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="needs-you-title">
            <h2 id="needs-you-title" className="text-xl font-semibold text-[var(--ink)]">Needs you today</h2>
            {summary.lateCharges.map((charge) => (
              <div key={charge.id} className="domus-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">{charge.tenantName || "Tenant"} owes {formatCurrency(charge.amountCents)}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{charge.propertyName || "Home"} · {charge.unitNumber || "Unit"} · due {formatDate(charge.dueDate)}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" className="min-h-11" disabled={isSending} onClick={() => sendReminder(charge.id)} title="Send this tenant a rent reminder.">Send reminder</Button>
                    <Button type="button" className="min-h-11" onClick={() => setPaymentChargeId((current) => current === charge.id ? null : charge.id)} title="Record rent paid outside Domus.">Mark as paid</Button>
                  </div>
                </div>
                {paymentChargeId === charge.id ? (
                  <div className="mt-4 border-t border-[var(--line)] pt-4">
                    <ManualPaymentForm charge={charge} action={paymentAction} />
                    {paymentState && !paymentState.success ? <p className="mt-2 text-sm text-[var(--crit)]">{paymentState.error}</p> : null}
                  </div>
                ) : null}
              </div>
            ))}

            {summary.openRepairCount === 0 && summary.newMessageCount === 0 ? (
              <p className="text-sm text-[var(--muted)]">No open repairs. No new messages.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.openRepairCount > 0 ? <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={() => onOpenSection("maintenance")} title="Open Repairs.">{summary.openRepairCount} open repair{summary.openRepairCount === 1 ? "" : "s"}</Button> : null}
                {summary.newMessageCount > 0 ? <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={() => onOpenSection("inbox")} title="Open Messages.">{summary.newMessageCount} new message{summary.newMessageCount === 1 ? "" : "s"}</Button> : null}
              </div>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-3" aria-label="Portfolio summary">
            <SummaryTile title="Rent this month" value={`${formatCurrency(summary.collectedCents)} of ${formatCurrency(summary.dueCents)}`} progress={dueProgress} />
            <SummaryTile title="Homes" value={String(summary.homeCount)} detail={`${summary.rentedHomeCount} of ${summary.homeCount} rented`} />
            <SummaryTile title="Next rent due" value={summary.nextDueDate ? formatDate(summary.nextDueDate) : "No rent due"} detail={`${formatCurrency(summary.nextDueAmountCents)} from ${summary.nextDueTenantCount} tenant${summary.nextDueTenantCount === 1 ? "" : "s"}`} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--ink)]">More numbers</h2>
            <FinancialOverviewPanel {...financialOverview} onInitiatePlaidLink={onInitiatePlaidLink} onCompletePlaidLink={onCompletePlaidLink} onRefreshPlaidBalance={onRefreshPlaidBalance} onDisconnectPlaid={onDisconnectPlaid} />
          </section>
        </>
      )}
    </div>
  );
}
