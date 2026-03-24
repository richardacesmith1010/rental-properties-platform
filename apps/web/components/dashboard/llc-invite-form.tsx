"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format";
import type { LLCInvitationDTO } from "@/lib/llc-invitations";
import type { StatefulAction } from "./types";

interface LLCInviteFormProps {
  accountId: string;
  pendingInvitations: LLCInvitationDTO[];
  onSendInvitations?: StatefulAction;
  onResendInvitation?: StatefulAction;
  onCancelInvitation?: StatefulAction;
}

export function LLCInviteForm({
  accountId,
  pendingInvitations,
  onSendInvitations,
  onResendInvitation,
  onCancelInvitation
}: LLCInviteFormProps) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [isSending, startSendTransition] = useTransition();
  const [rowActionState, startRowActionTransition] = useTransition();
  const [activeRowAction, setActiveRowAction] = useState<string | null>(null);

  const handleSend = () => {
    if (!onSendInvitations) {
      return;
    }

    startSendTransition(async () => {
      const formData = new FormData();
      formData.set("accountId", accountId);
      formData.set("emails", emails);
      const result = await onSendInvitations(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to send LLC invitations right now.");
        return;
      }

      toast.success(result.message ?? "Invitations sent.");
      setEmails("");
      router.refresh();
    });
  };

  const runInvitationAction = (invitationId: string, action: "resend" | "cancel") => {
    const handler = action === "resend" ? onResendInvitation : onCancelInvitation;
    if (!handler) {
      return;
    }

    startRowActionTransition(async () => {
      setActiveRowAction(`${action}:${invitationId}`);
      const formData = new FormData();
      formData.set("invitationId", invitationId);
      const result = await handler(null, formData);
      setActiveRowAction(null);
      if (!result?.success) {
        toast.error(result?.error ?? `Unable to ${action} this invitation right now.`);
        return;
      }

      toast.success(result.message ?? (action === "resend" ? "Invitation resent." : "Invitation cancelled."));
      router.refresh();
    });
  };

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle>Invite Members</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter one or more email addresses. Domus will send each co-owner a one-click invitation to join this LLC.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="llc-member-emails" className="text-sm font-medium text-foreground">
            Email addresses (one per line or comma-separated)
          </label>
          <Textarea
            id="llc-member-emails"
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            rows={5}
            placeholder={"brother@example.com\nsister@example.com"}
            title="Enter one or more email addresses for LLC members."
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending || !onSendInvitations}
            title="Send Domus LLC invitations to these email addresses."
          >
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailPlus className="mr-2 h-4 w-4" />}
            Send Invitations
          </Button>
          <p className="text-xs text-muted-foreground">
            Invite links expire after 7 days. You can resend any pending invite below.
          </p>
        </div>

        {pendingInvitations.length === 0 ? (
          <Alert>
            You have no pending invitations. Add your co-owners above to bring them into this LLC.
          </Alert>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Pending invitations</p>
                <p className="text-xs text-muted-foreground">
                  Resend or cancel any invitation that has not been accepted yet.
                </p>
              </div>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {pendingInvitations.length}
              </span>
            </div>

            <div className="space-y-2">
              {pendingInvitations.map((invitation) => {
                const resendBusy = rowActionState && activeRowAction === `resend:${invitation.id}`;
                const cancelBusy = rowActionState && activeRowAction === `cancel:${invitation.id}`;
                return (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Sent {formatRelativeTime(invitation.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => runInvitationAction(invitation.id, "resend")}
                        disabled={rowActionState}
                        title={`Resend the Domus LLC invitation to ${invitation.email}.`}
                      >
                        {resendBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                        Resend
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => runInvitationAction(invitation.id, "cancel")}
                        disabled={rowActionState}
                        title={`Cancel the Domus LLC invitation for ${invitation.email}.`}
                      >
                        {cancelBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-2 h-3.5 w-3.5" />}
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
