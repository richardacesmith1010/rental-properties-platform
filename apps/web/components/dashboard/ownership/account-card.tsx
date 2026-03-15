"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataRow } from "@/components/shared/data-row";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SubmitButton } from "@/components/shared/submit-button";
import { BankBalanceCard } from "@/components/dashboard/bank-balance-card";
import { DistributionConfigPanel } from "@/components/dashboard/distribution-config-panel";
import { PlaidLinkButton } from "@/components/dashboard/plaid-link-button";
import type {
  AccountDeleteRequestDTO,
  AccountRenameRequestDTO,
  OwnershipAccountDTO,
  OwnershipMemberDTO
} from "@/lib/ownership";
import type { StatefulAction } from "../types";
import { DeleteRequestBanner, RenameRequestBanner } from "./governance-banners";
import {
  OwnershipAccountStripeControl,
  OwnershipAccountSummary
} from "./member-management";

function RenameAccountForm({
  account,
  onRenameOwnershipAccount,
  onCancel
}: {
  account: OwnershipAccountDTO;
  onRenameOwnershipAccount: StatefulAction;
  onCancel: () => void;
}) {
  const [state, formAction] = useFormState(onRenameOwnershipAccount, null);
  const [newName, setNewName] = useState(account.displayName);
  const disableSubmit = newName.trim().length === 0 || newName.trim() === account.displayName;

  useEffect(() => {
    setNewName(account.displayName);
  }, [account.displayName, account.id]);

  useEffect(() => {
    if (state?.success) {
      onCancel();
    }
  }, [onCancel, state]);

  return (
    <Card className="mt-3 border-violet-200/80 bg-violet-50/20">
      <CardContent className="space-y-4 pt-4">
        {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
        {state?.success ? <Alert variant="success">{state.message ?? "Account updated."}</Alert> : null}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="accountId" value={account.id} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Account name</label>
            <Input
              name="newName"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Enter a new account name"
              title={`Rename ${account.displayName}.`}
            />
          </div>
          {account.accountType === "llc" ? (
            <Alert variant="info" className="text-xs font-normal">
              Multi-member LLC renames require a member vote before the new name is applied.
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton
              disabled={disableSubmit}
              title={`Save a new display name for ${account.displayName}.`}
            >
              Save Name
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              title="Cancel renaming this account."
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteLlcButton({
  account,
  onRequestDeleteLLC
}: {
  account: OwnershipAccountDTO;
  onRequestDeleteLLC: StatefulAction;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const description =
    account.memberCount > 1
      ? `This will permanently delete "${account.displayName}" and unlink all associated properties. This cannot be undone. All members must vote to approve.`
      : `This will permanently delete "${account.displayName}" and unlink all associated properties. This cannot be undone.`;

  const handleConfirm = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("accountId", account.id);
      const result = await onRequestDeleteLLC(null, formData);

      if (!result?.success) {
        toast.error(result?.error ?? "Unable to request deletion right now.");
        return;
      }

      toast.success(result.message ?? "Delete request submitted.");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
        title={`Delete ${account.displayName} after member approval.`}
      >
        {isPending ? "Submitting..." : "Delete Account"}
      </Button>
      <ConfirmDialog
        title="Delete LLC Account"
        description={description}
        confirmLabel={account.memberCount > 1 ? "Request Deletion" : "Delete Account"}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export interface OwnershipAccountCardProps {
  account: OwnershipAccountDTO;
  isLast: boolean;
  isActive: boolean;
  currentUserId?: string;
  members?: OwnershipMemberDTO[];
  pendingRenameRequest?: AccountRenameRequestDTO;
  pendingDeleteRequest?: AccountDeleteRequestDTO;
  isRenaming: boolean;
  isDistributionOpen: boolean;
  isWithdrawalOpen: boolean;
  onToggleRename?: () => void;
  onCancelRename: () => void;
  onToggleDistribution: () => void;
  onToggleWithdrawal?: () => void;
  onRenameOwnershipAccount?: StatefulAction;
  onVoteOnAccountRename?: StatefulAction;
  onRequestDeleteLLC?: StatefulAction;
  onVoteOnDeleteLLC?: StatefulAction;
  onInitiateAccountStripeConnect?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;
  onSubmitDistributionChangeRequest?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
}

export function OwnershipAccountCard(props: OwnershipAccountCardProps) {
  const {
    account,
    isLast,
    isActive,
    currentUserId,
    members,
    pendingRenameRequest,
    pendingDeleteRequest,
    isRenaming,
    isDistributionOpen,
    isWithdrawalOpen,
    onToggleRename,
    onCancelRename,
    onToggleDistribution,
    onToggleWithdrawal,
    onRenameOwnershipAccount,
    onVoteOnAccountRename,
    onRequestDeleteLLC,
    onVoteOnDeleteLLC,
    onInitiateAccountStripeConnect,
    onUpdateDistributionConfig,
    onSubmitDistributionChangeRequest,
    onInitiateMemberPayoutConnect,
    onInitiatePlaidLink,
    onCompletePlaidLink,
    onRefreshPlaidBalance,
    onDisconnectPlaid
  } = props;

  const canConfigureDistribution =
    account.accountType === "llc" && isActive && Boolean(onUpdateDistributionConfig);
  const canRequestWithdrawal =
    account.accountType === "llc" && isActive && Boolean(onToggleWithdrawal);
  const showPlaidTools =
    account.accountType === "llc" &&
    ((account.plaidConnected && Boolean(onRefreshPlaidBalance) && Boolean(onDisconnectPlaid)) ||
      (!account.plaidConnected && Boolean(onInitiatePlaidLink) && Boolean(onCompletePlaidLink)));
  const hasExpandedContent = Boolean(
    pendingRenameRequest ||
      pendingDeleteRequest ||
      isRenaming ||
      isDistributionOpen ||
      showPlaidTools
  );

  return (
    <Fragment>
      <DataRow last={isLast && !hasExpandedContent}>
        <OwnershipAccountSummary account={account} isActive={isActive} />
        <div className="flex flex-col items-end gap-2">
          <OwnershipAccountStripeControl
            account={account}
            onInitiateAccountStripeConnect={onInitiateAccountStripeConnect}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {onRenameOwnershipAccount && onToggleRename ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onToggleRename}
                disabled={Boolean(pendingRenameRequest)}
                title={`Rename ${account.displayName}.`}
              >
                {pendingRenameRequest ? "Rename Pending" : isRenaming ? "Hide Rename" : "Rename"}
              </Button>
            ) : null}
            {account.accountType === "llc" && onRequestDeleteLLC ? (
              pendingDeleteRequest ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled
                  title={`A delete vote is already pending for ${account.displayName}.`}
                >
                  Delete Pending
                </Button>
              ) : (
                <DeleteLlcButton account={account} onRequestDeleteLLC={onRequestDeleteLLC} />
              )
            ) : null}
          </div>
          {canConfigureDistribution ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onToggleDistribution}
                title={`Configure how rent payments are distributed for ${account.displayName}.`}
              >
                {isDistributionOpen ? "Hide Distribution" : "Configure Distribution"}
              </Button>
              {canRequestWithdrawal ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onToggleWithdrawal}
                  title={`Request a withdrawal from ${account.displayName}.`}
                >
                  {isWithdrawalOpen ? "Hide Withdrawal" : "Request Withdrawal"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </DataRow>
      {isRenaming && onRenameOwnershipAccount ? (
        <RenameAccountForm
          account={account}
          onRenameOwnershipAccount={onRenameOwnershipAccount}
          onCancel={onCancelRename}
        />
      ) : null}
      {pendingRenameRequest ? (
        <RenameRequestBanner
          request={pendingRenameRequest}
          currentUserId={currentUserId}
          onVote={onVoteOnAccountRename}
        />
      ) : null}
      {pendingDeleteRequest ? (
        <DeleteRequestBanner
          request={pendingDeleteRequest}
          currentUserId={currentUserId}
          onVote={onVoteOnDeleteLLC}
        />
      ) : null}
      {showPlaidTools ? (
        account.plaidConnected && onRefreshPlaidBalance && onDisconnectPlaid ? (
          <BankBalanceCard
            accountId={account.id}
            bankName={account.bankName}
            bankMask={account.bankMask}
            balanceCents={account.balanceCents}
            balanceUpdatedAt={account.balanceUpdatedAt}
            onRefreshBalance={onRefreshPlaidBalance}
            onDisconnect={onDisconnectPlaid}
          />
        ) : onInitiatePlaidLink && onCompletePlaidLink ? (
          <PlaidLinkButton
            accountId={account.id}
            onInitiatePlaidLink={onInitiatePlaidLink}
            onCompletePlaidLink={onCompletePlaidLink}
          />
        ) : null
      ) : null}
      {isDistributionOpen && members && onUpdateDistributionConfig ? (
        <DistributionConfigPanel
          accountId={account.id}
          accountDisplayName={account.displayName}
          currentMode={account.distributionMode}
          members={members.filter((member) => member.active)}
          onUpdateDistributionConfig={onUpdateDistributionConfig}
          onSubmitDistributionChangeRequest={onSubmitDistributionChangeRequest}
          onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
        />
      ) : null}
    </Fragment>
  );
}
