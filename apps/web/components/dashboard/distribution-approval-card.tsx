"use client";

import { useFormState } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DistributionApprovalCardProps {
  request: DistributionChangeRequestDTO;
  currentUserId: string;
  onVote: StatefulAction;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusVariant(status: DistributionChangeRequestDTO["status"]) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "rejected":
      return "destructive" as const;
    case "cancelled":
      return "outline" as const;
    default:
      return "warning" as const;
  }
}

function describeConfig(config: DistributionChangeRequestDTO["currentConfig"]) {
  if (config.mode === "retain") {
    return "Retain all funds in the LLC account.";
  }

  if (config.mode === "split_equal") {
    return `Split equally across ${config.members.length} member${config.members.length === 1 ? "" : "s"}.`;
  }

  return config.members
    .map((member) => `${member.profileId.slice(0, 6)}: ${(member.pct ?? 0).toFixed(2)}%`)
    .join(" · ");
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
        title={`${vote === "approve" ? "Approve" : "Reject"} this distribution request.`}
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

export function DistributionApprovalCard({
  request,
  currentUserId,
  onVote
}: DistributionApprovalCardProps) {
  const currentUserVote = request.votes.find((vote) => vote.voterId === currentUserId);

  return (
    <Card className="border-violet-200/80 bg-violet-50/30">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Distribution Approval</CardTitle>
          <Badge variant={statusVariant(request.status)} className="capitalize">
            {request.status}
          </Badge>
        </div>
        <div className="text-sm text-zinc-600">
          Proposed by {request.requestedByName ?? "Unknown"} · {formatTimestamp(request.createdAt)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current</p>
            <p className="mt-2 text-sm text-zinc-800">{describeConfig(request.currentConfig)}</p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proposed</p>
            <p className="mt-2 text-sm text-zinc-800">{describeConfig(request.proposedConfig)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          {request.votesReceived} vote{request.votesReceived === 1 ? "" : "s"} cast · {request.votesRequired} required
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
        ) : currentUserVote ? (
          <Alert variant="info" className="text-xs font-normal">
            You already voted {currentUserVote.vote} on this request.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
