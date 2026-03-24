"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Mail,
  MailPlus,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { DistributionConfigPanel } from "@/components/dashboard/distribution-config-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Textarea } from "@/components/ui/textarea";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";
import { pluralize } from "@/lib/format";
import type { StatefulAction } from "./types";

interface MembersSectionProps {
  account: OwnershipAccountDTO | null;
  members: OwnershipMemberDTO[];
  currentUserId?: string;
  onRenameOwnershipAccount?: StatefulAction;
  onRemoveOwnershipMember?: StatefulAction;
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

function buildJoinCodeSubject(accountName: string) {
  return `Join ${accountName} on Domus`;
}

function buildJoinCodeBody(accountName: string, joinCode: string) {
  return [
    `I've set up ${accountName} on Domus for managing our rental properties.`,
    "",
    "To join, create an account at domusbase.com and enter this code:",
    joinCode
  ].join("\n");
}

function ShareJoinCodeModal({
  open,
  onClose,
  accountName,
  joinCode
}: {
  open: boolean;
  onClose: () => void;
  accountName: string;
  joinCode: string;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const subject = buildJoinCodeSubject(accountName);
  const body = buildJoinCodeBody(accountName, joinCode);

  if (!open) {
    return null;
  }

  return (
    <ModalOverlay open={open} onClose={onClose}>
      <Card className="mx-auto w-full max-w-xl border border-border/70 bg-card shadow-2xl">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-xl font-semibold text-foreground">Share via Email</CardTitle>
          <p className="text-sm text-muted-foreground">
            This opens your default mail app with the Domus join instructions pre-filled.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <label htmlFor="share-email-recipient" className="text-sm font-medium text-foreground">
              Recipient email
            </label>
            <Input
              id="share-email-recipient"
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="co-owner@example.com"
              title="Enter the recipient email address."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Subject</label>
            <Input value={subject} readOnly title="Email subject preview." />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Message</label>
            <Textarea value={body} readOnly rows={6} title="Email body preview." />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} title="Close this email draft.">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.location.href = mailtoUrl;
                onClose();
              }}
              title="Open your email app with this draft."
            >
              <MailPlus className="mr-2 h-4 w-4" />
              Open Email Draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </ModalOverlay>
  );
}

export function MembersSection({
  account,
  members,
  currentUserId,
  onRenameOwnershipAccount,
  onRemoveOwnershipMember,
  onUpdateDistributionConfig,
  onSubmitDistributionChangeRequest,
  onInitiateMemberPayoutConnect
}: MembersSectionProps) {
  const router = useRouter();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
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

  const handleCopyCode = async () => {
    if (!account.joinCode) {
      toast.error("Join code unavailable for this LLC.");
      return;
    }

    try {
      await navigator.clipboard.writeText(account.joinCode);
      toast.success("Join code copied.");
    } catch (error) {
      console.error("MembersSection copy join code error:", error);
      toast.error("Unable to copy the join code right now.");
    }
  };

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

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Invite Members</CardTitle>
          <p className="text-sm text-muted-foreground">
            Share this code with your co-owners. They&apos;ll enter it after creating their Domus account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {account.joinCode ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-6 py-5 text-center">
              <div className="text-3xl font-semibold tracking-[0.3em] text-violet-900 sm:text-4xl">
                {account.joinCode}
              </div>
            </div>
          ) : (
            <Alert variant="warning">
              Join code unavailable for this LLC right now.
            </Alert>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopyCode()}
              disabled={!account.joinCode}
              title="Copy this LLC join code."
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Code
            </Button>
            <Button
              type="button"
              onClick={() => setShareModalOpen(true)}
              disabled={!account.joinCode}
              title="Open an email draft with these join instructions."
            >
              <Mail className="mr-2 h-4 w-4" />
              Share via Email
            </Button>
          </div>
        </CardContent>
      </Card>

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
                        ? "border-violet-300 bg-violet-50/60"
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

      {account.joinCode ? (
        <ShareJoinCodeModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          accountName={account.displayName}
          joinCode={account.joinCode}
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
