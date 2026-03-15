"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { formatCurrency } from "@/lib/format";
import type { ActionState } from "@/app/actions";
import type { WithdrawalRequestDTO } from "@/lib/withdrawals";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface WithdrawalRequestCardProps {
  request: WithdrawalRequestDTO;
  currentUserId: string;
  onVote: StatefulAction;
  onExecuteApprovedWithdrawal?: StatefulAction;
  isAdmin?: boolean;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusVariant(status: WithdrawalRequestDTO["status"]) {
  switch (status) {
    case "approved":
    case "completed":
      return "success" as const;
    case "rejected":
      return "destructive" as const;
    case "cancelled":
      return "outline" as const;
    default:
      return "warning" as const;
  }
}

function VoteActionForm({
  requestId,
  vote,
  onVote
}: {
  requestId: string;
  vote: "approve" | "reject";
  onVote: StatefulAction;
}) {
  const [state, formAction] = useFormState(onVote, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="vote" value={vote} />
      <SubmitButton
        size="sm"
        variant={vote === "approve" ? "default" : "destructive"}
        title={`${vote === "approve" ? "Approve" : "Reject"} this withdrawal request.`}
      >
        {vote === "approve" ? "Approve" : "Reject"}
      </SubmitButton>
      {state && !state.success ? (
        <Alert variant="error" className="text-xs font-normal">
          {state.error}
        </Alert>
      ) : null}
      {state?.success && state.message ? (
        <Alert variant="success" className="text-xs font-normal">
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}

function ExecuteWithdrawalForm({
  request,
  onExecuteApprovedWithdrawal
}: {
  request: WithdrawalRequestDTO;
  onExecuteApprovedWithdrawal: StatefulAction;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, formAction] = useFormState(onExecuteApprovedWithdrawal, null);

  return (
    <div className="space-y-2">
      {!showConfirm ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setShowConfirm(true)}
          title={`Execute a live Stripe payout of ${formatCurrency(request.amountCents)}.`}
        >
          Execute Payout - {formatCurrency(request.amountCents)}
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <p className="text-sm text-emerald-900">
            Are you sure? This will transfer {formatCurrency(request.amountCents)} to{" "}
            {request.requestedByName ?? "the requester"}.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="withdrawalId" value={request.id} />
              <SubmitButton
                size="sm"
                variant="destructive"
                className="bg-emerald-600 hover:bg-emerald-700"
                title={`Confirm the live payout for ${request.requestedByName ?? "this member"}.`}
              >
                Confirm Payout
              </SubmitButton>
            </form>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowConfirm(false)}
              title="Cancel this payout."
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {state && !state.success ? (
        <Alert variant="error" className="text-xs font-normal">
          {state.error}
        </Alert>
      ) : null}
      {state?.success && state.message ? (
        <Alert variant="success" className="text-xs font-normal">
          {state.message}
        </Alert>
      ) : null}
    </div>
  );
}

export function WithdrawalRequestCard({
  request,
  currentUserId,
  onVote,
  onExecuteApprovedWithdrawal,
  isAdmin = false
}: WithdrawalRequestCardProps) {
  const currentUserVote = request.votes.find((vote) => vote.voterId === currentUserId);

  return (
    <Card className="border-amber-200/80 bg-amber-50/20">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Withdrawal Request</CardTitle>
          <Badge variant={statusVariant(request.status)} className="capitalize">
            {request.status}
          </Badge>
        </div>
        <div className="text-sm text-zinc-600">
          Requested by {request.requestedByName ?? "Unknown"} · {formatTimestamp(request.createdAt)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-lg font-semibold text-zinc-900">{formatCurrency(request.amountCents)}</p>
          <p className="mt-1 text-sm text-zinc-600">{request.reason ?? "No reason provided."}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          {request.votesReceived} votes cast · {request.votesRequired} required
        </div>

        <div className="space-y-2">
          {request.votes.length === 0 ? (
            <p className="text-sm text-zinc-500">No votes recorded yet.</p>
          ) : (
            request.votes.map((vote) => (
              <div
                key={`${request.id}:${vote.voterId}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm"
              >
                <span className="text-zinc-800">{vote.voterName ?? "Unknown member"}</span>
                <Badge variant={vote.vote === "approve" ? "success" : "destructive"}>
                  {vote.vote}
                </Badge>
              </div>
            ))
          )}
        </div>

        {request.status === "pending" && !currentUserVote ? (
          <div className="flex flex-wrap gap-3">
            <VoteActionForm requestId={request.id} vote="approve" onVote={onVote} />
            <VoteActionForm requestId={request.id} vote="reject" onVote={onVote} />
          </div>
        ) : request.status === "approved" && isAdmin && onExecuteApprovedWithdrawal ? (
          <ExecuteWithdrawalForm
            request={request}
            onExecuteApprovedWithdrawal={onExecuteApprovedWithdrawal}
          />
        ) : currentUserVote ? (
          <Alert variant="info" className="text-xs font-normal">
            You already voted {currentUserVote.vote} on this withdrawal.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
