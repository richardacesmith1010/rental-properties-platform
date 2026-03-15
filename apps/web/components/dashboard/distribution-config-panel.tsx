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
  onInitiateMemberPayoutConnect
}: DistributionConfigPanelProps) {
  const [state, formAction] = useFormState(onUpdateDistributionConfig, null);
  const [mode, setMode] = useState<DistributionMode>(
    currentMode === "split_equal" || currentMode === "split_custom" ? currentMode : "retain"
  );
  const [memberPcts, setMemberPcts] = useState<Map<string, number>>(() => buildPctMap(members));

  useEffect(() => {
    setMode(currentMode === "split_equal" || currentMode === "split_custom" ? currentMode : "retain");
    setMemberPcts(buildPctMap(members));
  }, [currentMode, members]);

  const activeMembers = useMemo(() => members.filter((member) => member.active), [members]);
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
    <Card className="mt-3 border-violet-200/80 bg-violet-50/40">
      <CardHeader>
        <CardTitle>Distribution Settings</CardTitle>
        <p className="text-sm text-zinc-600">
          Configure how rent payments for {accountDisplayName} are routed after the LLC account receives funds.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
        {state?.success ? <Alert variant="success">{state.message ?? "Distribution updated."}</Alert> : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="mode" value={mode} />

          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "retain"}
                onChange={() => setMode("retain")}
                className="mt-1"
                title="Keep all rent funds in the LLC Stripe account."
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900">Retain All</p>
                <p className="text-xs text-zinc-500">All funds stay in the LLC account.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "split_equal"}
                onChange={() => setMode("split_equal")}
                className="mt-1"
                title="Split rent evenly across all active LLC members."
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900">Split Equally</p>
                <p className="text-xs text-zinc-500">Each active member receives an equal share.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <input
                type="radio"
                name="distribution-mode"
                checked={mode === "split_custom"}
                onChange={() => setMode("split_custom")}
                className="mt-1"
                title="Set custom percentages per active LLC member."
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900">Custom Split</p>
                <p className="text-xs text-zinc-500">Set exact percentages for each active member.</p>
              </div>
            </label>
          </div>

          {mode === "retain" ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
              All funds stay in the LLC account.
            </div>
          ) : null}

          {mode === "split_equal" ? (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-zinc-700">Each member receives an equal share.</p>
              {activeMembers.length === 0 ? (
                <p className="text-sm text-red-600">No active members are available for distribution.</p>
              ) : (
                activeMembers.map((member, index) => (
                  <DataRow key={member.profileId} last={index === activeMembers.length - 1}>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{member.fullName}</p>
                      <p className="text-xs text-zinc-500">{member.email}</p>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">
                      {equalShare.toFixed(2)}%
                    </span>
                  </DataRow>
                ))
              )}
            </div>
          ) : null}

          {mode === "split_custom" ? (
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
              {activeMembers.map((member, index) => {
                const currentPct = memberPcts.get(member.profileId) ?? 0;
                return (
                  <DataRow key={member.profileId} last={index === activeMembers.length - 1}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">{member.fullName}</p>
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
              Members without a payout account keep their share in the LLC account.
            </div>
            <SubmitButton disabled={disableSave} title="Save this distribution configuration.">
              Save Distribution
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
