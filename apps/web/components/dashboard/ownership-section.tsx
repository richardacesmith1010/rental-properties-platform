"use client";

import { Fragment, type KeyboardEvent, useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";
import type { DistributionHistoryEntry, FinancialActivityEvent } from "@/lib/distributions";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import type { WithdrawalRequestDTO } from "@/lib/withdrawals";
import { Alert } from "@/components/ui/alert";
import { DistributionConfigPanel } from "./distribution-config-panel";
import { DistributionHistory } from "./distribution-history";
import { DistributionApprovalCard } from "./distribution-approval-card";
import { WithdrawalRequestCard } from "./withdrawal-request-card";
import { FinancialActivityFeed } from "./financial-activity-feed";
import { BankBalanceCard } from "./bank-balance-card";
import { PlaidLinkButton } from "./plaid-link-button";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyOption {
  id: string;
  name: string;
  ownerAccountName: string;
}

interface OwnershipSectionProps {
  activeAccountId?: string | null;
  currentUserId?: string;
  accounts: OwnershipAccountDTO[];
  properties: PropertyOption[];
  members?: OwnershipMemberDTO[];
  distributionHistory?: DistributionHistoryEntry[];
  pendingChangeRequests?: DistributionChangeRequestDTO[];
  pendingWithdrawals?: WithdrawalRequestDTO[];
  financialActivityFeed?: FinancialActivityEvent[];
  onCreateOwnershipAccount: StatefulAction;
  onLinkPropertyToOwnershipAccount: StatefulAction;
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

interface CreateAccountDraft {
  accountType: "llc" | "individual";
  displayName: string;
}

interface LinkPropertyDraft {
  propertyId: string;
  ownershipAccountId: string;
}

const CREATE_ACCOUNT_STEPS = ["Account Type", "Display Name", "Review & Save"] as const;
const LINK_PROPERTY_STEPS = ["Select Property", "Select Account", "Review & Save"] as const;

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <Alert variant="error">
      {state.error}
    </Alert>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <Alert variant="success">
      {message}
    </Alert>
  );
}

function StepPill({
  label,
  active,
  done
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(
  event: KeyboardEvent<HTMLInputElement>,
  canAdvance: boolean,
  advance: () => void
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
}

const unavailableConnectAction: StatefulAction = async () => ({
  success: false,
  error: "Bank connection is unavailable for this account."
});

function OwnershipAccountStripeControl({
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

export function OwnershipSection({
  activeAccountId,
  currentUserId,
  accounts,
  properties,
  members,
  distributionHistory,
  pendingChangeRequests,
  pendingWithdrawals,
  financialActivityFeed,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount,
  onInitiateAccountStripeConnect,
  onUpdateDistributionConfig,
  onSubmitDistributionChangeRequest,
  onVoteOnDistributionChange,
  onInitiateMemberPayoutConnect,
  onSubmitWithdrawalRequest,
  onVoteOnWithdrawal,
  onInitiatePlaidLink,
  onCompletePlaidLink,
  onRefreshPlaidBalance,
  onDisconnectPlaid,
  onExecuteApprovedWithdrawal
}: OwnershipSectionProps) {
  const [createState, createAction] = useFormState(onCreateOwnershipAccount, null);
  const [linkState, linkAction] = useFormState(onLinkPropertyToOwnershipAccount, null);
  const [activeFlow, setActiveFlow] = useState<OwnershipFlow>("create_account");
  const [createStep, setCreateStep] = useState(0);
  const [linkStep, setLinkStep] = useState(0);
  const [distributionAccountId, setDistributionAccountId] = useState<string | null>(null);
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

  const createRequiredComplete = Boolean(createDraft.accountType && createDraft.displayName);
  const linkRequiredComplete = Boolean(linkDraft.propertyId && linkDraft.ownershipAccountId);

  const createStepComplete = (step: number) => {
    if (step === 0) return Boolean(createDraft.accountType);
    if (step === 1) return Boolean(createDraft.displayName);
    return createRequiredComplete;
  };

  const linkStepComplete = (step: number) => {
    if (step === 0) return Boolean(linkDraft.propertyId);
    if (step === 1) return Boolean(linkDraft.ownershipAccountId);
    return linkRequiredComplete;
  };

  useEffect(() => {
    if (!createState?.success) return;
    setCreateStep(0);
    setCreateDraft({
      accountType: "llc",
      displayName: ""
    });
  }, [createState]);

  useEffect(() => {
    if (!linkState?.success) return;
    setLinkStep(0);
    setLinkDraft({
      propertyId: "",
      ownershipAccountId: ""
    });
  }, [linkState]);

  useEffect(() => {
    setDistributionAccountId((current) => (current === activeAccountId ? current : null));
    setShowWithdrawalForm(false);
    setActivityView("history");
  }, [activeAccountId]);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const isActiveLlcAccount = activeAccount?.accountType === "llc";
  const isActiveAccountAdmin = Boolean(
    currentUserId &&
      members?.some(
        (member) =>
          member.profileId === currentUserId &&
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
          <p className="text-sm text-zinc-600">
            One field at a time. Press Enter or Next to continue.
          </p>
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

          {activeFlow === "create_account" && (
            <div className="space-y-4">
              <FormError state={createState} />
              <FormSuccess state={createState} message="Ownership account created." />
              <div className="grid grid-cols-3 gap-2">
                {CREATE_ACCOUNT_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={createStep === index}
                    done={createStepComplete(index)}
                  />
                ))}
              </div>

              {createStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Choose account type.</p>
                  <Select
                    value={createDraft.accountType}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        accountType: event.target.value as "llc" | "individual"
                      }))
                    }
                    required
                  >
                    <option value="llc">LLC</option>
                    <option value="individual">Individual</option>
                  </Select>
                </div>
              )}

              {createStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Enter display name.</p>
                  <Input
                    value={createDraft.displayName}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        displayName: event.target.value
                      }))
                    }
                    onKeyDown={(event) =>
                      onEnterNext(event, createStepComplete(createStep), () => setCreateStep(2))
                    }
                    placeholder="Display name (e.g., Smith Family LLC)"
                    required
                  />
                </div>
              )}

              {createStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and create account.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p>
                      <span className="font-semibold">Type:</span>{" "}
                      {createDraft.accountType === "llc" ? "LLC" : "Individual"}
                    </p>
                    <p>
                      <span className="font-semibold">Display Name:</span>{" "}
                      {createDraft.displayName || "Not set"}
                    </p>
                  </div>
                  <form className="space-y-2" action={createAction}>
                    <input type="hidden" name="accountType" value={createDraft.accountType} />
                    <input type="hidden" name="displayName" value={createDraft.displayName} />
                    <SubmitButton
                      className="w-full"
                      disabled={!createRequiredComplete}
                      title="Create this ownership account for individual or LLC use."
                    >
                      Create Account
                    </SubmitButton>
                  </form>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateStep((current) => Math.max(current - 1, 0))}
                  disabled={createStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setCreateStep((current) => Math.min(current + 1, CREATE_ACCOUNT_STEPS.length - 1))
                  }
                  disabled={createStep >= CREATE_ACCOUNT_STEPS.length - 1 || !createStepComplete(createStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateStep(0);
                    setCreateDraft({ accountType: "llc", displayName: "" });
                  }}
                  title="Restart account creation."
                >
                  Restart
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "link_property" && (
            <div className="space-y-4">
              <FormError state={linkState} />
              <FormSuccess state={linkState} message="Property account updated." />
              <div className="grid grid-cols-3 gap-2">
                {LINK_PROPERTY_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={linkStep === index}
                    done={linkStepComplete(index)}
                  />
                ))}
              </div>

              {linkStep === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 1: Select property.</p>
                  <Select
                    value={linkDraft.propertyId}
                    onChange={(event) =>
                      setLinkDraft((current) => ({ ...current, propertyId: event.target.value }))
                    }
                    required
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {linkStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Step 2: Select ownership account.</p>
                  <Select
                    value={linkDraft.ownershipAccountId}
                    onChange={(event) =>
                      setLinkDraft((current) => ({
                        ...current,
                        ownershipAccountId: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Select ownership account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {linkStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">Final step: review and link property.</p>
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    <p>
                      <span className="font-semibold">Property:</span>{" "}
                      {properties.find((property) => property.id === linkDraft.propertyId)?.name ?? "Not set"}
                    </p>
                    <p>
                      <span className="font-semibold">Account:</span>{" "}
                      {accounts.find((account) => account.id === linkDraft.ownershipAccountId)?.displayName ??
                        "Not set"}
                    </p>
                  </div>
                  <form className="space-y-2" action={linkAction}>
                    <input type="hidden" name="propertyId" value={linkDraft.propertyId} />
                    <input type="hidden" name="ownershipAccountId" value={linkDraft.ownershipAccountId} />
                    <SubmitButton
                      className="w-full"
                      disabled={!linkRequiredComplete}
                      title="Attach the selected property to this ownership account."
                    >
                      Link Property
                    </SubmitButton>
                  </form>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkStep((current) => Math.max(current - 1, 0))}
                  disabled={linkStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setLinkStep((current) => Math.min(current + 1, LINK_PROPERTY_STEPS.length - 1))
                  }
                  disabled={linkStep >= LINK_PROPERTY_STEPS.length - 1 || !linkStepComplete(linkStep)}
                  title="Complete this step and move to the next step."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLinkStep(0);
                    setLinkDraft({
                      propertyId: "",
                      ownershipAccountId: ""
                    });
                  }}
                  title="Restart property linking."
                >
                  Restart
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Ownership Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No ownership accounts"
                description="Create an ownership account to organize your properties."
              />
            ) : (
              <div>
                {accounts.map((account, index) => {
                  const canConfigureDistribution =
                    account.accountType === "llc" &&
                    account.id === activeAccountId &&
                    Boolean(onUpdateDistributionConfig);
                  const canRequestWithdrawal =
                    account.accountType === "llc" &&
                    account.id === activeAccountId &&
                    Boolean(onSubmitWithdrawalRequest);
                  const showDistributionPanel = distributionAccountId === account.id;
                  const showPlaidTools =
                    account.accountType === "llc" &&
                    ((account.plaidConnected &&
                      Boolean(onRefreshPlaidBalance) &&
                      Boolean(onDisconnectPlaid)) ||
                      (!account.plaidConnected &&
                        Boolean(onInitiatePlaidLink) &&
                        Boolean(onCompletePlaidLink)));

                  return (
                    <Fragment key={account.id}>
                      <DataRow
                        last={
                          index === accounts.length - 1 &&
                          !showDistributionPanel &&
                          !showPlaidTools
                        }
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-900">{account.displayName}</p>
                            <Badge variant="outline" className="capitalize">
                              {account.accountType}
                            </Badge>
                            {account.id === activeAccountId ? <Badge variant="default">Active</Badge> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500 capitalize">
                            {account.memberCount} member{account.memberCount === 1 ? "" : "s"} • distribution{" "}
                            {account.distributionMode.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <OwnershipAccountStripeControl
                            account={account}
                          onInitiateAccountStripeConnect={onInitiateAccountStripeConnect}
                        />
                          {canConfigureDistribution ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDistributionAccountId(
                                    distributionAccountId === account.id ? null : account.id
                                  )
                                }
                                title={`Configure how rent payments are distributed for ${account.displayName}.`}
                              >
                                {distributionAccountId === account.id
                                  ? "Hide Distribution"
                                  : "Configure Distribution"}
                              </Button>
                              {canRequestWithdrawal ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowWithdrawalForm((current) => !current)}
                                  title={`Request a withdrawal from ${account.displayName}.`}
                                >
                                  {showWithdrawalForm ? "Hide Withdrawal" : "Request Withdrawal"}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </DataRow>
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
                      {showDistributionPanel && members && onUpdateDistributionConfig ? (
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
                })}
              </div>
            )}
          </CardContent>
        </Card>
        {isActiveLlcAccount && pendingChangeRequests && pendingChangeRequests.length > 0 && currentUserId && onVoteOnDistributionChange ? (
          <div className="space-y-3">
            {pendingChangeRequests.map((request) => (
              <DistributionApprovalCard
                key={request.id}
                request={request}
                currentUserId={currentUserId}
                onVote={onVoteOnDistributionChange}
              />
            ))}
          </div>
        ) : null}
        {isActiveLlcAccount && activeAccountId && showWithdrawalForm && onSubmitWithdrawalRequest ? (
          <WithdrawalRequestForm
            accountId={activeAccountId}
            onSubmitWithdrawalRequest={onSubmitWithdrawalRequest}
          />
        ) : null}
        {isActiveLlcAccount && pendingWithdrawals && pendingWithdrawals.length > 0 && currentUserId && onVoteOnWithdrawal ? (
          <div className="space-y-3">
            {pendingWithdrawals.map((request) => (
              <WithdrawalRequestCard
                key={request.id}
                request={request}
                currentUserId={currentUserId}
                onVote={onVoteOnWithdrawal}
                isAdmin={isActiveAccountAdmin}
                onExecuteApprovedWithdrawal={onExecuteApprovedWithdrawal}
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
              <DistributionHistory entries={distributionHistory ?? []} />
            ) : (
              <FinancialActivityFeed events={financialActivityFeed ?? []} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
