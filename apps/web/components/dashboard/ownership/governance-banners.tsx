"use client";

import { useFormState } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/app/actions";
import type { AccountDeleteRequestDTO, AccountRenameRequestDTO } from "@/lib/ownership";
import type { StatefulAction } from "../types";

type GovernanceVoteAction = StatefulAction;

function GovernanceVoteForm({
  requestId,
  vote,
  onVote,
  title
}: {
  requestId: string;
  vote: "approve" | "reject";
  onVote: GovernanceVoteAction;
  title: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(onVote, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="vote" value={vote} />
      <SubmitButton
        size="sm"
        variant={vote === "approve" ? "outline" : "destructive"}
        title={title}
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

export function RenameRequestBanner({
  request,
  currentUserId,
  onVote
}: {
  request: AccountRenameRequestDTO;
  currentUserId?: string;
  onVote?: GovernanceVoteAction;
}) {
  const currentUserVote = request.votes.find((vote) => vote.voterId === currentUserId);

  return (
    <Card className="mt-3 border-amber-200/80 bg-amber-50/20">
      <CardContent className="space-y-3 pt-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Rename to &quot;{request.proposedName}&quot; — {request.votesReceived}/{request.votesRequired} votes
          </p>
          <p className="text-xs text-zinc-600">Requested by {request.requestedByName}</p>
        </div>
        <Alert variant="warning" className="text-xs font-normal">
          This LLC rename is waiting for member approval. The current name remains &quot;{request.currentName}&quot; until the vote passes.
        </Alert>
        {request.status === "pending" && onVote && !currentUserVote ? (
          <div className="flex flex-wrap gap-2">
            <GovernanceVoteForm
              requestId={request.id}
              vote="approve"
              onVote={onVote}
              title="Approve this LLC rename request."
            />
            <GovernanceVoteForm
              requestId={request.id}
              vote="reject"
              onVote={onVote}
              title="Reject this LLC rename request."
            />
          </div>
        ) : currentUserVote ? (
          <Alert variant="info" className="text-xs font-normal">
            You voted to {currentUserVote.vote}.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DeleteRequestBanner({
  request,
  currentUserId,
  onVote
}: {
  request: AccountDeleteRequestDTO;
  currentUserId?: string;
  onVote?: GovernanceVoteAction;
}) {
  const currentUserVote = request.votes.find((vote) => vote.voterId === currentUserId);

  return (
    <Card className="mt-3 border-red-200/80 bg-red-50/30">
      <CardContent className="space-y-3 pt-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Deletion requested — {request.votesReceived}/{request.votesRequired} votes
          </p>
          <p className="text-xs text-zinc-600">Requested by {request.requestedByName}</p>
        </div>
        <Alert variant="error" className="text-xs font-normal">
          Approving this request will unlink all properties from the LLC account and permanently delete it.
        </Alert>
        <div className="rounded-xl border border-[var(--crit)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-2)]">
          {request.reason?.trim() ? request.reason : "No reason provided."}
        </div>
        {request.status === "pending" && onVote && !currentUserVote ? (
          <div className="flex flex-wrap gap-2">
            <GovernanceVoteForm
              requestId={request.id}
              vote="approve"
              onVote={onVote}
              title="Approve this LLC deletion request."
            />
            <GovernanceVoteForm
              requestId={request.id}
              vote="reject"
              onVote={onVote}
              title="Reject this LLC deletion request."
            />
          </div>
        ) : currentUserVote ? (
          <Alert variant="info" className="text-xs font-normal">
            You voted to {currentUserVote.vote}.
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
