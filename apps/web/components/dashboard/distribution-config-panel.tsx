"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { DataRow } from "@/components/shared/data-row";
import type { ActionState } from "@/app/actions";
import type { OwnershipMemberDTO } from "@/lib/ownership";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type DistributionMode = "retain" | "split_equal" | "split_custom";

interface DistributionConfigPanelProps {
  accountId: string;
  accountDisplayName: string;
  currentMode: string;
  members: OwnershipMemberDTO[];
  onUpdateDistributionConfig: StatefulAction;
  onSubmitDistributionChangeRequest?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
}

function buildPctMap(members: OwnershipMemberDTO[]) {
  return new Map(
    members.map((member) => [member.profileId, member.distributionPct ?? 0])
  );
}

const unavailableConnectAction: StatefulAction = async () => ({
  success: false,
  error: "Member payout onboarding is unavailable."
});

function MemberPayoutConnectButton({
  accountId,
  profileId,
  onInitiateMemberPayoutConnect
}: {
  accountId: string;
  profileId: string;
  onInitiateMemberPayoutConnect?: StatefulAction;
}) {
  const [connectState, connectAction] = useFormState(
    onInitiateMemberPayoutConnect ?? unavailableConnectAction,
    null
  );

  useEffect(() => {
    if (connectState?.success && connectState.url) {
      window.location.assign(connectState.url);
    }
  }, [connectState]);

  if (!onInitiateMemberPayoutConnect) {
    return null;
  }

  return (
    <form action={connectAction} className="space-y-2">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="profileId" value={profileId} />
      <SubmitButton
        size="sm"
        variant="outline"
        title="Connect a payout bank account for this member."
      >
        Connect Payout
      </SubmitButton>
      {connectState && !connectState.success ? (
        <Alert variant="error" className="text-xs font-normal">
          {connectState.error}
        </Alert>
      ) : null}
    </form>
  );
}

export function DistributionConfigPanel({
  accountId,
  accountDisplayName,
  currentMode,
  members,
  onUpdateDistributionConfig,
  onSubmitDistributionChangeRequest,
  onInitiateMemberPayoutConnect
}: DistributionConfigPanelProps) {
  const activeMembers = useMemo(() => members.filter((member) => member.active), [members]);
  const requiresApproval =
    activeMembers.length >= 2 && Boolean(onSubmitDistributionChangeRequest);
  const [state, formAction] = useFormState(
    requiresApproval && onSubmitDistributionChangeRequest
      ? onSubmitDistributionChangeRequest
      : onUpdateDistributionConfig,
    null
  );
  const [mode, setMode] = useState<DistributionMode>(
    currentMode === "split_equal" || currentMode === "split_custom" ? currentMode : "retain"
  );
  const [memberPcts, setMemberPcts] = useState<Map<string, number>>(() => buildPctMap(members));

  useEffect(() => {
    setMode(currentMode === "split_equal" || currentMode === "split_custom" ? currentMode : "retain");
    setMemberPcts(buildPctMap(members));
  }, [currentMode, members]);

  const customTotal = useMemo(
    () => Array.from(memberPcts.values()).reduce((sum, pct) => sum + pct, 0),
    [memberPcts]
  );
  const customTotalValid = Math.abs(customTotal - 100) <= 0.01;
  const equalShare = activeMembers.length > 0 ? 100 / activeMembers.length : 0;
  const disableSave =
    (mode === "split_custom" && !customTotalValid) ||
    (mode === "split_equal" && activeMembers.length === 0);

  return (
    <Card className="mt-3 border-[var(--accent-line)] bg-[var(--accent-weak)]">
      <CardHeader>
        <CardTitle>Distribution Settings</CardTitle>
        <p className="text-sm text-zinc-600">
          How should rent money be split for {accountDisplayName}?
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
        {state?.success ? <Alert variant="success">{state.message ?? "Distribution updated."}</Alert> : null}
        {requiresApproval ? (
          <Alert variant="info" className="text-sm font-normal">
            This LLC has multiple active members. Saving this form will create an approval request instead of applying changes immediately.
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="mode" value={mode} />

          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "retain"}
                onChange={() => setMode("retain")}
                className="mt-1"
                title="Keep all rent funds in the LLC Stripe account."
              />
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Retain All</p>
                <p className="text-xs text-zinc-500">Keep all money in the LLC.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "split_equal"}
                onChange={() => setMode("split_equal")}
                className="mt-1"
                title="Split rent evenly across all active LLC members."
              />
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Split Equally</p>
                <p className="text-xs text-zinc-500">Everyone gets the same amount.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "split_custom"}
                onChange={() => setMode("split_custom")}
                className="mt-1"
                title="Set custom percentages per active LLC member."
              />
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Custom Split</p>
                <p className="text-xs text-zinc-500">You pick who gets what.</p>
              </div>
            </label>
          </div>

          {mode === "retain" ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
              Keep all money in the LLC.
            </div>
          ) : null}

          {mode === "split_equal" ? (
            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <p className="text-sm font-medium text-zinc-700">Everyone gets the same amount.</p>
              {activeMembers.length === 0 ? (
                <p className="text-sm text-red-600">No active members are available for distribution.</p>
              ) : (
                activeMembers.map((member, index) => (
                  <DataRow key={member.profileId} last={index === activeMembers.length - 1}>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{member.fullName}</p>
                      <p className="text-xs text-zinc-500">{member.email}</p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {equalShare.toFixed(2)}%
                    </span>
                  </DataRow>
                ))
              )}
            </div>
          ) : null}

          {mode === "split_custom" ? (
            <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              {activeMembers.map((member, index) => {
                const currentPct = memberPcts.get(member.profileId) ?? 0;
                return (
                  <DataRow key={member.profileId} last={index === activeMembers.length - 1}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{member.fullName}</p>
                      <p className="truncate text-xs text-zinc-500">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        name={`pct_${member.profileId}`}
                        value={currentPct}
                        onChange={(event) => {
                          const nextValue = Number.parseFloat(event.target.value);
                          setMemberPcts((current) => {
                            const next = new Map(current);
                            next.set(member.profileId, Number.isNaN(nextValue) ? 0 : nextValue);
                            return next;
                          });
                        }}
                        className="h-9 w-24 text-right"
                        title={`Set ${member.fullName}'s distribution percentage.`}
                      />
                      <Badge variant={member.payoutStripeConnected ? "success" : "outline"}>
                        {member.payoutStripeConnected ? "Payout Connected" : "Not Connected"}
                      </Badge>
                      {!member.payoutStripeConnected ? (
                        <MemberPayoutConnectButton
                          accountId={accountId}
                          profileId={member.profileId}
                          onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
                        />
                      ) : null}
                    </div>
                  </DataRow>
                );
              })}
              <div
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  customTotalValid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                Total: {customTotal.toFixed(2)}%
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              If someone hasn&apos;t linked their bank, their share stays in the LLC.
            </div>
            <SubmitButton
              disabled={disableSave}
              title={
                requiresApproval
                  ? "Send this split update for member approval."
                  : "Save this distribution configuration."
              }
            >
              {requiresApproval ? "Request Approval" : "Save Distribution"}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
