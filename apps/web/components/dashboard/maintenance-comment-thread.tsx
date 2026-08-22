"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { MessageSquare } from "lucide-react";
import type { ActionState } from "@/app/actions";
import type { MaintenanceComment } from "@/lib/maintenance";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface CommentThreadProps {
  ticketId: string;
  comments: MaintenanceComment[];
  onAddComment: StatefulAction;
  canAddInternal?: boolean;
}

function CommentState({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.success) {
    return (
      <Alert variant="success">
        {state.message ?? "Comment added."}
      </Alert>
    );
  }

  return (
    <Alert variant="error">
      {state.error}
    </Alert>
  );
}

function roleLabel(role: string) {
  if (role === "owner" || role === "manager" || role === "tenant") {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  return "Team";
}

export function MaintenanceCommentThread({
  ticketId,
  comments,
  onAddComment,
  canAddInternal = false
}: CommentThreadProps) {
  const [state, action] = useFormState(onAddComment, null);
  const [isInternal, setIsInternal] = useState(false);
  const orderedComments = useMemo(
    () => [...comments].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [comments]
  );

  return (
    <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="space-y-3">
        {orderedComments.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No comments yet"
            description="Updates between residents and property staff will appear here."
          />
        ) : (
          orderedComments.map((comment) => (
            <div
              key={comment.id}
              className={`rounded-xl border px-4 py-3 ${
                comment.isInternal
                  ? "border-amber-200 bg-amber-50"
                  : "border-zinc-200 bg-zinc-50/80"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--ink)]">{comment.authorName}</p>
                <Badge variant="outline">{roleLabel(comment.authorRole)}</Badge>
                {comment.isInternal ? <Badge variant="warning">Internal</Badge> : null}
                <p className="text-xs text-zinc-500">{formatDateTime(comment.createdAt)}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{comment.body}</p>
            </div>
          ))
        )}
      </div>

      <form action={action} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="isInternal" value={isInternal ? "true" : "false"} />
        <CommentState state={state} />
        <div className="space-y-2">
          <label htmlFor={`ticket-comment-${ticketId}`} className="text-sm font-medium text-zinc-700">
            Add Comment
          </label>
          <Textarea
            id={`ticket-comment-${ticketId}`}
            name="body"
            rows={3}
            placeholder="Share an update, answer a question, or note next steps."
            required
          />
        </div>
        {canAddInternal ? (
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(event) => setIsInternal(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent-line)]"
            />
            <span>Internal note (visible only to owner/manager)</span>
          </label>
        ) : null}
        <SubmitButton size="sm" title="Add this maintenance comment to the thread.">
          Add Comment
        </SubmitButton>
      </form>
    </div>
  );
}
