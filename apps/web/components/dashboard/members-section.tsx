"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { DistributionConfigPanel } from "@/components/dashboard/distribution-config-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LLCInvitationDTO } from "@/lib/llc-invitations";
import { pluralize } from "@/lib/format";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";
import { LLCInviteForm } from "./llc-invite-form";
import type { StatefulAction } from "./types";

interface MembersSectionProps {
  account: OwnershipAccountDTO | null;
  members: OwnershipMemberDTO[];
  pendingInvitations?: LLCInvitationDTO[];
  currentUserId?: string;
  onRenameOwnershipAccount?: StatefulAction;
  onRemoveOwnershipMember?: StatefulAction;
  onSendLLCInvitations?: StatefulAction;
  onResendLLCInvitation?: StatefulAction;
  onCancelLLCInvitation?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;
  onSubmitDistributionChangeRequest?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
}

function getInitials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MembersSection({
  account,
  members,
  pendingInvitations = [],
  currentUserId,
  onRenameOwnershipAccount,
  onRemoveOwnershipMember,
  onSendLLCInvitations,
  onResendLLCInvitation,
  onCancelLLCInvitation,
  onUpdateDistributionConfig,
  onSubmitDistributionChangeRequest,
  onInitiateMemberPayoutConnect
}: MembersSectionProps) {
  const router = useRouter();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<OwnershipMemberDTO | null>(null);
  const [isRemoving, startTransition] = useTransition();

  const activeMembers = useMemo(() => members.filter((member) => member.active), [members]);

  if (!account || account.accountType !== "llc") {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No LLC members page"
        description="Members only appears for LLC ownership accounts."
        showDom={false}
      />
    );
  }

  const handleRemoveMember = () => {
    if (!memberToRemove || !onRemoveOwnershipMember) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("accountId", account.id);
      formData.set("profileId", memberToRemove.profileId);
      const result = await onRemoveOwnershipMember(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to remove this LLC member.");
        return;
      }

      toast.success(result.message ?? "LLC member removed.");
      setMemberToRemove(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Your LLC</p>
              <CardTitle className="mt-1 text-2xl font-semibold text-foreground">
                {account.displayName}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">LLC</Badge>
              <Badge variant="outline">{pluralize(activeMembers.length, "member")}</Badge>
              {onRenameOwnershipAccount ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRenameOpen(true)}
                  title={`Edit ${account.displayName}.`}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
      </Card>

      <LLCInviteForm
        accountId={account.id}
        pendingInvitations={pendingInvitations}
        onSendInvitations={onSendLLCInvitations}
        onResendInvitation={onResendLLCInvitation}
        onCancelInvitation={onCancelLLCInvitation}
      />

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Current Members</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No active members"
              description="You're the only member. Invite your co-owners above."
              showDom={false}
            />
          ) : (
            <div className="space-y-3">
              {activeMembers.length === 1 ? (
                <Alert variant="info">You&apos;re the only member. Invite your co-owners above.</Alert>
              ) : null}
              {activeMembers.map((member) => {
                const isCurrentUser = member.profileId === currentUserId;
                return (
                  <div
                    key={member.profileId}
                    className={`rounded-2xl border px-4 py-4 ${
                      isCurrentUser
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/60 bg-card"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {getInitials(member.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{member.fullName}</p>
                            {isCurrentUser ? <Badge variant="default">You</Badge> : null}
                            <Badge variant="outline" className="capitalize">
                              {member.memberRole}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{member.email}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {member.distributionPct !== null
                                ? `${member.distributionPct.toFixed(2)}% distribution`
                                : "Retained in LLC"}
                            </Badge>
                            <Badge variant={member.payoutStripeConnected ? "success" : "outline"}>
                              {member.payoutStripeConnected ? "Stripe connected" : "Stripe not connected"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {!isCurrentUser && onRemoveOwnershipMember ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isRemoving}
                          onClick={() => setMemberToRemove(member)}
                          title={`Remove ${member.fullName} from this LLC.`}
                          aria-label={`Remove ${member.fullName}`}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {onUpdateDistributionConfig ? (
        <DistributionConfigPanel
          accountId={account.id}
          accountDisplayName={account.displayName}
          currentMode={account.distributionMode}
          members={activeMembers}
          onUpdateDistributionConfig={onUpdateDistributionConfig}
          onSubmitDistributionChangeRequest={onSubmitDistributionChangeRequest}
          onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
        />
      ) : null}

      {onRenameOwnershipAccount ? (
        <EntityEditModal
          open={isRenameOpen}
          onClose={() => setIsRenameOpen(false)}
          title="Edit LLC Name"
          entityType="LLC"
          submitLabel="Save Name"
          fields={[
            {
              key: "displayName",
              label: "LLC Name",
              value: account.displayName,
              type: "text",
              required: true,
              placeholder: "Enter your LLC name"
            }
          ]}
          onSave={async (updates) => {
            const nextName = String(updates.displayName ?? "").trim();
            const formData = new FormData();
            formData.set("accountId", account.id);
            formData.set("newName", nextName);
            const result = await onRenameOwnershipAccount(null, formData);
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "LLC name updated." };
            }
            return { error: result?.error ?? "Unable to update this LLC name right now." };
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToRemove(null);
          }
        }}
        title="Remove LLC Member"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.fullName} from ${account.displayName}? They will lose access to this LLC in Domus.`
            : ""
        }
        confirmLabel="Remove Member"
        onConfirm={handleRemoveMember}
      />
    </div>
  );
}
