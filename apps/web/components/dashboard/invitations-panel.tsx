"use client";

import { useFormState } from "react-dom";
import { Mail, RotateCcw, UserPlus, XCircle } from "lucide-react";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { InvitationListItem } from "@/lib/invitations";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";

interface InvitationsPanelProps {
  invitations: InvitationListItem[];
  onResendInvite: StatefulAction;
  onRevokeInvite: StatefulAction;
  onOpenInviteWizard?: () => void;
  previewCount?: number;
}

const statusVariant: Record<string, "warning" | "success" | "outline"> = {
  pending: "warning",
  accepted: "success",
  expired: "outline"
};

function StateMessage({ state }: { state: ActionState }) {
  if (!state) {
    return null;
  }

  return state.success ? (
    <Alert variant="success" className="mt-3">
      {state.message ?? "Updated."}
    </Alert>
  ) : (
    <Alert variant="error" className="mt-3">
      {state.error}
    </Alert>
  );
}

function InvitationActions({
  invitation,
  onResendInvite,
  onRevokeInvite
}: {
  invitation: InvitationListItem;
  onResendInvite: StatefulAction;
  onRevokeInvite: StatefulAction;
}) {
  const [resendState, resendAction] = useFormState(onResendInvite, null);
  const [revokeState, revokeAction] = useFormState(onRevokeInvite, null);

  if (invitation.status !== "pending") {
    return null;
  }

  return (
    <div className="w-full space-y-3 sm:w-auto">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <SubmitButton size="sm" variant="outline" title="Resend the invitation email.">
            <RotateCcw className="mr-2 h-4 w-4" />
            Resend
          </SubmitButton>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <SubmitButton size="sm" variant="outline" title="Revoke this pending invitation.">
            <XCircle className="mr-2 h-4 w-4" />
            Revoke
          </SubmitButton>
        </form>
      </div>
      <StateMessage state={resendState} />
      <StateMessage state={revokeState} />
    </div>
  );
}

export function InvitationsPanel({
  invitations,
  onResendInvite,
  onRevokeInvite,
  onOpenInviteWizard,
  previewCount = 5
}: InvitationsPanelProps) {
  const tenantInvitations = invitations.filter((invitation) => invitation.role === "tenant");
  const visibleInvitations = tenantInvitations.slice(0, previewCount);

  return (
    <Card className="h-full border border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-xl font-semibold">Tenant Invitations</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Track pending invites, resend links, and revoke access before they accept.
          </p>
        </div>
        {onOpenInviteWizard ? (
          <Button type="button" variant="outline" onClick={onOpenInviteWizard} title="Open the tenant invite wizard.">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Tenant
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="h-full">
        {tenantInvitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No tenant invitations yet"
            description="Send a branded invite when you are ready to onboard the next renter."
            actionLabel={onOpenInviteWizard ? "Invite Tenant" : undefined}
            onAction={onOpenInviteWizard}
            className="max-w-none px-4 py-10"
          />
        ) : (
          <div className="space-y-3">
            {visibleInvitations.map((invitation) => {
              const statusLabel = invitation.status === "expired" ? "Revoked" : invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1);
              return (
                <div key={invitation.id} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{invitation.fullName}</p>
                        <Badge variant={statusVariant[invitation.status] ?? "outline"}>{statusLabel}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{invitation.email}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {invitation.propertyName ?? "Property pending"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sent {formatDate(invitation.createdAt)}
                        {invitation.acceptedAt ? ` · Accepted ${formatDate(invitation.acceptedAt)}` : ""}
                      </p>
                    </div>
                    <InvitationActions
                      invitation={invitation}
                      onResendInvite={onResendInvite}
                      onRevokeInvite={onRevokeInvite}
                    />
                  </div>
                </div>
              );
            })}
            {tenantInvitations.length > visibleInvitations.length ? (
              <p className="text-xs text-muted-foreground">
                Showing {visibleInvitations.length} of {tenantInvitations.length} invitations. Open the Invitations section for the full list.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
