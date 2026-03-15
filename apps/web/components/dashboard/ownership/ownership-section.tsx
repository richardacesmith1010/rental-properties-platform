"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { DistributionApprovalCard } from "@/components/dashboard/distribution-approval-card";
import { DistributionHistory } from "@/components/dashboard/distribution-history";
import { FinancialActivityFeed } from "@/components/dashboard/financial-activity-feed";
import { WithdrawalRequestCard } from "@/components/dashboard/withdrawal-request-card";
import type {
  AccountDeleteRequestDTO,
  AccountRenameRequestDTO,
  OwnershipAccountDTO,
  OwnershipMemberDTO
} from "@/lib/ownership";
import type { DistributionHistoryEntry, FinancialActivityEvent } from "@/lib/distributions";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import type { WithdrawalRequestDTO } from "@/lib/withdrawals";
import type { StatefulAction } from "../types";
import {
  CreateAccountWorkflowCard,
  type CreateAccountDraft,
  LinkPropertyWorkflowCard,
  type LinkPropertyDraft,
  type PropertyOption
} from "./create-account-form";
import { OwnershipAccountCard } from "./account-card";

interface OwnershipSectionProps {
  activeAccountId?: string | null;
  currentUserId?: string;
  accounts: OwnershipAccountDTO[];
  properties: PropertyOption[];
  members?: OwnershipMemberDTO[];
  pendingAccountRenameRequests?: AccountRenameRequestDTO[];
  pendingAccountDeleteRequests?: AccountDeleteRequestDTO[];
  distributionHistory?: DistributionHistoryEntry[];
  pendingChangeRequests?: DistributionChangeRequestDTO[];
  pendingWithdrawals?: WithdrawalRequestDTO[];
  financialActivityFeed?: FinancialActivityEvent[];
  onCreateOwnershipAccount: StatefulAction;
  onLinkPropertyToOwnershipAccount: StatefulAction;
  onRenameOwnershipAccount?: StatefulAction;
  onVoteOnAccountRename?: StatefulAction;
  onRequestDeleteLLC?: StatefulAction;
  onVoteOnDeleteLLC?: StatefulAction;
  onInitiateAccountStripeConnect?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;
  onSubmitDistributionChangeRequest?: StatefulAction;
  onVoteOnDistributionChange?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
  onSubmitWithdrawalRequest?: StatefulAction;
  onVoteOnWithdrawal?: StatefulAction;
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
  onExecuteApprovedWithdrawal?: StatefulAction;
}

type OwnershipFlow = "create_account" | "link_property";

function WithdrawalRequestForm({
  accountId,
  onSubmitWithdrawalRequest
}: {
  accountId: string;
  onSubmitWithdrawalRequest: StatefulAction;
}) {
  const [state, formAction] = useFormState(onSubmitWithdrawalRequest, null);
  const [amountDollars, setAmountDollars] = useState("");
  const [reason, setReason] = useState("");
  const amountValue = Number.parseFloat(amountDollars);
  const disableSubmit = !Number.isFinite(amountValue) || amountValue <= 0;

  useEffect(() => {
    if (state?.success) {
      setAmountDollars("");
      setReason("");
    }
  }, [state]);

  return (
    <Card className="mt-3 border-amber-200/80 bg-amber-50/20">
      <CardHeader>
        <CardTitle>Request Withdrawal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
        {state?.success ? <Alert variant="success">{state.message ?? "Withdrawal request submitted."}</Alert> : null}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="accountId" value={accountId} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Amount</label>
            <Input
              name="amountDollars"
              type="number"
              min="0"
              step="0.01"
              value={amountDollars}
              onChange={(event) => setAmountDollars(event.target.value)}
              placeholder="0.00"
              title="Enter the requested withdrawal amount in dollars."
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">Reason</label>
            <textarea
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition-all duration-150 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              placeholder="Optional context for other members."
              title="Explain why this withdrawal is needed."
            />
          </div>
          <SubmitButton
            disabled={disableSubmit}
            title="Submit this withdrawal request for member approval."
          >
            Request Withdrawal
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function OwnershipSection(props: OwnershipSectionProps) {
  const [createState, createAction] = useFormState(props.onCreateOwnershipAccount, null);
  const [linkState, linkAction] = useFormState(props.onLinkPropertyToOwnershipAccount, null);
  const [activeFlow, setActiveFlow] = useState<OwnershipFlow>("create_account");
  const [createStep, setCreateStep] = useState(0);
  const [linkStep, setLinkStep] = useState(0);
  const [distributionAccountId, setDistributionAccountId] = useState<string | null>(null);
  const [renameAccountId, setRenameAccountId] = useState<string | null>(null);
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [activityView, setActivityView] = useState<"history" | "activity">("history");
  const [createDraft, setCreateDraft] = useState<CreateAccountDraft>({
    accountType: "llc",
    displayName: ""
  });
  const [linkDraft, setLinkDraft] = useState<LinkPropertyDraft>({
    propertyId: "",
    ownershipAccountId: ""
  });

  useEffect(() => {
    if (!createState?.success) return;
    setCreateStep(0);
    setCreateDraft({ accountType: "llc", displayName: "" });
  }, [createState]);

  useEffect(() => {
    if (!linkState?.success) return;
    setLinkStep(0);
    setLinkDraft({ propertyId: "", ownershipAccountId: "" });
  }, [linkState]);

  useEffect(() => {
    setDistributionAccountId((current) => (current === props.activeAccountId ? current : null));
    setShowWithdrawalForm(false);
    setActivityView("history");
  }, [props.activeAccountId]);

  const pendingRenameRequestByAccount = useMemo(() => {
    const map = new Map<string, AccountRenameRequestDTO>();
    for (const request of props.pendingAccountRenameRequests ?? []) {
      if (!map.has(request.ownershipAccountId)) {
        map.set(request.ownershipAccountId, request);
      }
    }
    return map;
  }, [props.pendingAccountRenameRequests]);

  const pendingDeleteRequestByAccount = useMemo(() => {
    const map = new Map<string, AccountDeleteRequestDTO>();
    for (const request of props.pendingAccountDeleteRequests ?? []) {
      if (!map.has(request.ownershipAccountId)) {
        map.set(request.ownershipAccountId, request);
      }
    }
    return map;
  }, [props.pendingAccountDeleteRequests]);

  const activeAccount = props.accounts.find((account) => account.id === props.activeAccountId);
  const isActiveLlcAccount = activeAccount?.accountType === "llc";
  const isActiveAccountAdmin = Boolean(
    props.currentUserId &&
      props.members?.some(
        (member) =>
          member.profileId === props.currentUserId &&
          member.active &&
          (member.memberRole === "admin" || member.memberRole === "owner")
      )
  );

  return (
    <div id="ownership" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ownership Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">One field at a time. Press Enter or Next to continue.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "create_account" ? "default" : "outline"}
              onClick={() => setActiveFlow("create_account")}
              title="Create a new individual or LLC ownership account."
            >
              Create Account
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "link_property" ? "default" : "outline"}
              onClick={() => setActiveFlow("link_property")}
              title="Attach an existing property to an ownership account."
            >
              Link Property
            </Button>
          </div>

          {activeFlow === "create_account" ? (
            <CreateAccountWorkflowCard
              state={createState}
              action={createAction}
              createStep={createStep}
              setCreateStep={setCreateStep}
              createDraft={createDraft}
              setCreateDraft={setCreateDraft}
            />
          ) : (
            <LinkPropertyWorkflowCard
              state={linkState}
              action={linkAction}
              linkStep={linkStep}
              setLinkStep={setLinkStep}
              linkDraft={linkDraft}
              setLinkDraft={setLinkDraft}
              properties={props.properties}
              accountOptions={props.accounts.map((account) => ({
                id: account.id,
                displayName: account.displayName
              }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Ownership Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {props.accounts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No ownership accounts"
                description="Create an ownership account to organize your properties."
              />
            ) : (
              <div>
                {props.accounts.map((account, index) => (
                  <OwnershipAccountCard
                    key={account.id}
                    account={account}
                    isLast={index === props.accounts.length - 1}
                    isActive={account.id === props.activeAccountId}
                    currentUserId={props.currentUserId}
                    members={props.members}
                    pendingRenameRequest={pendingRenameRequestByAccount.get(account.id)}
                    pendingDeleteRequest={pendingDeleteRequestByAccount.get(account.id)}
                    isRenaming={renameAccountId === account.id}
                    isDistributionOpen={distributionAccountId === account.id}
                    isWithdrawalOpen={showWithdrawalForm && account.id === props.activeAccountId}
                    onToggleRename={
                      props.onRenameOwnershipAccount
                        ? () => {
                            setRenameAccountId((current) => (current === account.id ? null : account.id));
                          }
                        : undefined
                    }
                    onCancelRename={() => setRenameAccountId(null)}
                    onToggleDistribution={() =>
                      setDistributionAccountId((current) => (current === account.id ? null : account.id))
                    }
                    onToggleWithdrawal={
                      props.onSubmitWithdrawalRequest && account.id === props.activeAccountId
                        ? () => setShowWithdrawalForm((current) => !current)
                        : undefined
                    }
                    onRenameOwnershipAccount={props.onRenameOwnershipAccount}
                    onVoteOnAccountRename={props.onVoteOnAccountRename}
                    onRequestDeleteLLC={props.onRequestDeleteLLC}
                    onVoteOnDeleteLLC={props.onVoteOnDeleteLLC}
                    onInitiateAccountStripeConnect={props.onInitiateAccountStripeConnect}
                    onUpdateDistributionConfig={props.onUpdateDistributionConfig}
                    onSubmitDistributionChangeRequest={props.onSubmitDistributionChangeRequest}
                    onInitiateMemberPayoutConnect={props.onInitiateMemberPayoutConnect}
                    onInitiatePlaidLink={props.onInitiatePlaidLink}
                    onCompletePlaidLink={props.onCompletePlaidLink}
                    onRefreshPlaidBalance={props.onRefreshPlaidBalance}
                    onDisconnectPlaid={props.onDisconnectPlaid}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isActiveLlcAccount && props.pendingChangeRequests?.length && props.currentUserId && props.onVoteOnDistributionChange ? (
          <div className="space-y-3">
            {props.pendingChangeRequests.map((request) => (
              <DistributionApprovalCard
                key={request.id}
                request={request}
                currentUserId={props.currentUserId!}
                onVote={props.onVoteOnDistributionChange!}
              />
            ))}
          </div>
        ) : null}

        {isActiveLlcAccount && props.activeAccountId && showWithdrawalForm && props.onSubmitWithdrawalRequest ? (
          <WithdrawalRequestForm
            accountId={props.activeAccountId}
            onSubmitWithdrawalRequest={props.onSubmitWithdrawalRequest}
          />
        ) : null}

        {isActiveLlcAccount && props.pendingWithdrawals?.length && props.currentUserId && props.onVoteOnWithdrawal ? (
          <div className="space-y-3">
            {props.pendingWithdrawals.map((request) => (
              <WithdrawalRequestCard
                key={request.id}
                request={request}
                currentUserId={props.currentUserId!}
                onVote={props.onVoteOnWithdrawal!}
                isAdmin={isActiveAccountAdmin}
                onExecuteApprovedWithdrawal={props.onExecuteApprovedWithdrawal}
              />
            ))}
          </div>
        ) : null}

        {isActiveLlcAccount ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={activityView === "history" ? "default" : "outline"}
                onClick={() => setActivityView("history")}
                title="Show distribution transfer history."
              >
                Distribution History
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activityView === "activity" ? "default" : "outline"}
                onClick={() => setActivityView("activity")}
                title="Show the combined financial activity feed."
              >
                Activity Feed
              </Button>
            </div>
            {activityView === "history" ? (
              <DistributionHistory entries={props.distributionHistory ?? []} />
            ) : (
              <FinancialActivityFeed events={props.financialActivityFeed ?? []} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
