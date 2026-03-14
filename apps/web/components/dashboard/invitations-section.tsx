"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import type { StatefulAction, ActionState } from "@/app/actions";
import type { InvitationListItem } from "@/lib/invitations";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { InviteManagerForm } from "./invitations/invite-manager-form";
import { InviteTenantForm } from "./invitations/invite-tenant-form";

type InvitationFlow = "tenant" | "manager" | "owner";

interface OwnerInviteDraft {
  ownershipAccountId: string;
  email: string;
  fullName: string;
}

interface InvitationsSectionProps {
  ownershipAccounts: Array<{ id: string; displayName: string }>;
  properties: Array<{ id: string; name: string }>;
  invitations: InvitationListItem[];
  onInviteTenant: StatefulAction;
  onInviteManager: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite: StatefulAction;
  onTenantInviteSuccess?: () => void;
  onManagerInviteSuccess?: () => void;
  onOwnerInviteSuccess?: () => void;
}

const statusVariant: Record<string, "warning" | "success" | "outline"> = {
  pending: "warning",
  accepted: "success",
  expired: "outline"
};

const OWNER_STEPS = ["Pick Account", "Owner Email", "Owner Name", "Review & Send"] as const;

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{state.error}</p>;
}

function FormSuccess({ state, message = "Invitation sent!" }: { state: ActionState; message?: string }) {
  if (!state || !state.success) return null;
  return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">{message}</p>;
}

function StepPill({ label, active, done, skipped }: { label: string; active: boolean; done: boolean; skipped: boolean }) {
  const className = active
    ? "border-violet-300 bg-violet-50 text-violet-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function InvitationsSection({ ownershipAccounts, properties, invitations, onInviteTenant, onInviteManager, onInviteOwner, onResendInvite, onTenantInviteSuccess, onManagerInviteSuccess, onOwnerInviteSuccess }: InvitationsSectionProps) {
  const [ownerState, ownerAction] = useFormState(onInviteOwner ?? onInviteManager, null);
  const [activeFlow, setActiveFlow] = useState<InvitationFlow>("tenant");
  const [ownerStep, setOwnerStep] = useState(0);
  const [skippedOwnerSteps, setSkippedOwnerSteps] = useState<number[]>([]);
  const [ownerDraft, setOwnerDraft] = useState<OwnerInviteDraft>({ ownershipAccountId: "", email: "", fullName: "" });
  const handledOwnerStateRef = useRef<ActionState>(null);
  const ownerRequiredComplete = Boolean(ownerDraft.ownershipAccountId && ownerDraft.email && ownerDraft.fullName);
  const ownerStepComplete = (step: number) => step === 0 ? Boolean(ownerDraft.ownershipAccountId) : step === 1 ? Boolean(ownerDraft.email) : step === 2 ? Boolean(ownerDraft.fullName) : ownerRequiredComplete;

  useEffect(() => {
    if (!ownerState?.success || !onOwnerInviteSuccess) return;
    if (handledOwnerStateRef.current === ownerState) return;
    handledOwnerStateRef.current = ownerState;
    setOwnerDraft({ ownershipAccountId: "", email: "", fullName: "" });
    setOwnerStep(0);
    setSkippedOwnerSteps([]);
    onOwnerInviteSuccess();
  }, [onOwnerInviteSuccess, ownerState]);

  const onEnterNext = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, canAdvance: boolean, nextStep: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) setOwnerStep(nextStep);
  };

  const renderOwnerStep = () => {
    if (ownerStep === 0) {
      return <div className="space-y-3"><p className="text-sm text-zinc-600">Step 1: Pick ownership account for co-owner access.</p><Select value={ownerDraft.ownershipAccountId} onChange={(event) => setOwnerDraft((current) => ({ ...current, ownershipAccountId: event.target.value }))} onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), 1)} required><option value="">Select ownership account</option>{ownershipAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</Select></div>;
    }
    if (ownerStep === 1) {
      return <div className="space-y-3"><p className="text-sm text-zinc-600">Step 2: Enter co-owner email address.</p><Input type="email" value={ownerDraft.email} onChange={(event) => setOwnerDraft((current) => ({ ...current, email: event.target.value }))} onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), 2)} placeholder="co-owner@email.com" required /></div>;
    }
    if (ownerStep === 2) {
      return <div className="space-y-3"><p className="text-sm text-zinc-600">Step 3: Enter co-owner full name.</p><Input value={ownerDraft.fullName} onChange={(event) => setOwnerDraft((current) => ({ ...current, fullName: event.target.value }))} onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), 3)} placeholder="Co-owner full name" required /></div>;
    }

    return <div className="space-y-3"><p className="text-sm text-zinc-600">Final step: review and send co-owner invite.</p><div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700"><p><span className="font-semibold">Account:</span> {ownershipAccounts.find((account) => account.id === ownerDraft.ownershipAccountId)?.displayName ?? "Not set"}</p><p><span className="font-semibold">Email:</span> {ownerDraft.email || "Not set"}</p><p><span className="font-semibold">Name:</span> {ownerDraft.fullName || "Not set"}</p></div><form className="space-y-2" action={ownerAction}><input type="hidden" name="ownershipAccountId" value={ownerDraft.ownershipAccountId} /><input type="hidden" name="email" value={ownerDraft.email} /><input type="hidden" name="fullName" value={ownerDraft.fullName} /><SubmitButton className="w-full" disabled={!ownerRequiredComplete} title="Send co-owner invitation.">Send Co-owner Invite</SubmitButton></form></div>;
  };

  return (
    <div id="invitations" className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Invitation Workflow</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">One invitation at a time. Use Next or Enter to move forward. Skip is available, but send stays locked until required data is complete.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={activeFlow === "tenant" ? "default" : "outline"} onClick={() => setActiveFlow("tenant")} title="Start tenant invitation workflow.">Tenant Invite</Button>
            <Button type="button" size="sm" variant={activeFlow === "manager" ? "default" : "outline"} onClick={() => setActiveFlow("manager")} title="Start manager invitation workflow.">Manager Invite</Button>
            {onInviteOwner ? <Button type="button" size="sm" variant={activeFlow === "owner" ? "default" : "outline"} onClick={() => setActiveFlow("owner")} title="Start co-owner invitation workflow.">Co-owner Invite</Button> : null}
          </div>
          {activeFlow === "tenant" ? <InviteTenantForm properties={properties} onInviteTenant={onInviteTenant} onSuccess={onTenantInviteSuccess} /> : null}
          {activeFlow === "manager" ? <InviteManagerForm properties={properties} onInviteManager={onInviteManager} onSuccess={onManagerInviteSuccess} /> : null}
          {activeFlow === "owner" && onInviteOwner ? (
            <div className="space-y-4">
              <FormError state={ownerState} />
              <FormSuccess state={ownerState} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{OWNER_STEPS.map((label, index) => <StepPill key={label} label={label} active={ownerStep === index} done={ownerStepComplete(index)} skipped={skippedOwnerSteps.includes(index)} />)}</div>
              {renderOwnerStep()}
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setOwnerStep((current) => Math.max(current - 1, 0))} disabled={ownerStep === 0} title="Go back one step.">Back</Button><Button type="button" onClick={() => setOwnerStep((current) => Math.min(current + 1, OWNER_STEPS.length - 1))} disabled={ownerStep >= OWNER_STEPS.length - 1 || !ownerStepComplete(ownerStep)} title="Complete this step and move to the next one.">Next</Button><Button type="button" variant="outline" onClick={() => { setSkippedOwnerSteps((previous) => (previous.includes(ownerStep) ? previous : [...previous, ownerStep])); setOwnerStep((current) => Math.min(current + 1, OWNER_STEPS.length - 1)); }} disabled={ownerStep >= OWNER_STEPS.length - 1} title="Skip this step for now and continue.">Skip for now</Button></div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!onInviteOwner ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Co-owner invitations are unavailable until ownership accounts are enabled.</div> : null}

      <Card>
        <CardHeader><CardTitle>Sent Invitations</CardTitle></CardHeader>
        <CardContent>
          {invitations.length === 0 ? <EmptyState message="No invitations yet. Send a tenant or manager invitation to start onboarding." /> : <div>{invitations.map((invitation, index) => <InvitationRow key={invitation.id} invitation={invitation} last={index === invitations.length - 1} onResendInvite={onResendInvite} />)}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function InvitationRow({ invitation, last, onResendInvite }: { invitation: InvitationListItem; last: boolean; onResendInvite: StatefulAction }) {
  const [resendState, resendAction] = useFormState(onResendInvite, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{invitation.fullName}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{invitation.email}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={statusVariant[invitation.status] ?? "outline"}>{invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}</Badge>
          <Badge variant="outline">{invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}</Badge>
          {invitation.propertyName ? <Badge variant="outline">{invitation.propertyName}</Badge> : null}
          {invitation.ownershipAccountName ? <Badge variant="outline">{invitation.ownershipAccountName}</Badge> : null}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">Sent {formatDate(invitation.createdAt)}{invitation.acceptedAt ? ` · Accepted ${formatDate(invitation.acceptedAt)}` : ""}</p>
      </div>
      {invitation.status === "pending" ? (
        <div className="flex-shrink-0">
          <form action={resendAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <FormError state={resendState} />
            <FormSuccess state={resendState} message="Resent!" />
            <SubmitButton variant="outline" size="sm" title="Resend this pending invitation email.">Resend</SubmitButton>
          </form>
        </div>
      ) : null}
    </DataRow>
  );
}
