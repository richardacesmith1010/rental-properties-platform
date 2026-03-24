"use client";

import { ActionItems } from "@/components/dashboard/action-items";
import { FinancialOverviewPanel } from "@/components/dashboard/financial-overview-panel";
import { LlcSetupPrompt } from "@/components/dashboard/llc-setup-prompt";
import type { ActionItem } from "@/lib/action-items";
import type { StatefulAction } from "./types";

interface OwnerDailyOpsHomeProps {
  actionItems: ActionItem[];
  nextCollectionLabel: string | null;
  onOpenSection: (sectionId: string) => void;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  financialOverview: {
    accountId: string | null;
    plaidConnected: boolean;
    bankName: string | null;
    bankMask: string | null;
    balanceCents: number | null;
    balanceUpdatedAt: string | null;
    monthlyCollectedCents: number;
    monthlyOutstandingCents: number;
    monthlyExpensesCents: number;
    netIncomeCents: number;
    ytdIncomeCents: number;
    ytdExpensesCents: number;
    collectionRate: number;
  };
  llcSetupPrompt?: {
    accountName: string;
    memberCount: number;
    propertyCount: number;
    onInviteMembers: () => void;
    onAddProperty: () => void;
  } | null;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
}

export function OwnerDailyOpsHome({
  actionItems,
  nextCollectionLabel,
  onOpenSection,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  financialOverview,
  llcSetupPrompt,
  onInitiatePlaidLink,
  onCompletePlaidLink,
  onRefreshPlaidBalance,
  onDisconnectPlaid
}: OwnerDailyOpsHomeProps) {
  if (llcSetupPrompt) {
    return (
      <div className="flex min-h-full flex-col justify-center py-1 sm:py-4">
        <LlcSetupPrompt
          accountName={llcSetupPrompt.accountName}
          memberCount={llcSetupPrompt.memberCount}
          propertyCount={llcSetupPrompt.propertyCount}
          onInviteMembers={llcSetupPrompt.onInviteMembers}
          onAddProperty={llcSetupPrompt.onAddProperty}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 py-1 sm:gap-5">
      <ActionItems
        items={actionItems}
        nextCollectionLabel={nextCollectionLabel}
        onOpenSection={onOpenSection}
        onSendBatchPaymentReminder={onSendBatchPaymentReminder}
        onWaiveCharge={onWaiveCharge}
        onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
      />
      <FinancialOverviewPanel
        accountId={financialOverview.accountId}
        plaidConnected={financialOverview.plaidConnected}
        bankName={financialOverview.bankName}
        bankMask={financialOverview.bankMask}
        balanceCents={financialOverview.balanceCents}
        balanceUpdatedAt={financialOverview.balanceUpdatedAt}
        monthlyCollectedCents={financialOverview.monthlyCollectedCents}
        monthlyOutstandingCents={financialOverview.monthlyOutstandingCents}
        monthlyExpensesCents={financialOverview.monthlyExpensesCents}
        netIncomeCents={financialOverview.netIncomeCents}
        ytdIncomeCents={financialOverview.ytdIncomeCents}
        ytdExpensesCents={financialOverview.ytdExpensesCents}
        collectionRate={financialOverview.collectionRate}
        onInitiatePlaidLink={onInitiatePlaidLink}
        onCompletePlaidLink={onCompletePlaidLink}
        onRefreshPlaidBalance={onRefreshPlaidBalance}
        onDisconnectPlaid={onDisconnectPlaid}
      />
    </div>
  );
}
