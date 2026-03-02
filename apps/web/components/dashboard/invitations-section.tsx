"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { InvitationListItem } from "@/lib/invitations";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

type InvitationFlow = "tenant" | "manager" | "owner";

interface PropertyOption {
  id: string;
  name: string;
}

interface TenantInviteDraft {
  propertyId: string;
  email: string;
  fullName: string;
}

interface ManagerInviteDraft {
  propertyId: string;
  email: string;
  fullName: string;
}

interface OwnerInviteDraft {
  ownershipAccountId: string;
  email: string;
  fullName: string;
}

interface InvitationsSectionProps {
  ownershipAccounts: Array<{ id: string; displayName: string }>;
  properties: PropertyOption[];
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
  expired: "outline",
};

const TENANT_STEPS = ["Pick Property", "Tenant Email", "Tenant Name", "Review & Send"] as const;
const MANAGER_STEPS = ["Pick Property", "Manager Email", "Manager Name", "Review & Send"] as const;
const OWNER_STEPS = ["Pick Account", "Owner Email", "Owner Name", "Review & Send"] as const;

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({
  state,
  message,
}: {
  state: ActionState;
  message?: string;
}) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message ?? "Invitation sent!"}
    </p>
  );
}

function StepPill({
  label,
  active,
  done,
  skipped
}: {
  label: string;
  active: boolean;
  done: boolean;
  skipped: boolean;
}) {
  const className = active
    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : skipped
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-500";

  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

export function InvitationsSection({
  ownershipAccounts,
  properties,
  invitations,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onTenantInviteSuccess,
  onManagerInviteSuccess,
  onOwnerInviteSuccess
}: InvitationsSectionProps) {
  const [tenantState, tenantAction] = useFormState(onInviteTenant, null);
  const [managerState, managerAction] = useFormState(onInviteManager, null);
  const [ownerState, ownerAction] = useFormState(onInviteOwner ?? onInviteManager, null);

  const [activeFlow, setActiveFlow] = useState<InvitationFlow>("tenant");
  const [tenantStep, setTenantStep] = useState(0);
  const [managerStep, setManagerStep] = useState(0);
  const [ownerStep, setOwnerStep] = useState(0);
  const [skippedTenantSteps, setSkippedTenantSteps] = useState<number[]>([]);
  const [skippedManagerSteps, setSkippedManagerSteps] = useState<number[]>([]);
  const [skippedOwnerSteps, setSkippedOwnerSteps] = useState<number[]>([]);

  const [tenantDraft, setTenantDraft] = useState<TenantInviteDraft>({
    propertyId: "",
    email: "",
    fullName: ""
  });
  const [managerDraft, setManagerDraft] = useState<ManagerInviteDraft>({
    propertyId: "",
    email: "",
    fullName: ""
  });
  const [ownerDraft, setOwnerDraft] = useState<OwnerInviteDraft>({
    ownershipAccountId: "",
    email: "",
    fullName: ""
  });

  const handledTenantStateRef = useRef<ActionState>(null);
  const handledManagerStateRef = useRef<ActionState>(null);
  const handledOwnerStateRef = useRef<ActionState>(null);

  const tenantRequiredComplete = Boolean(
    tenantDraft.propertyId && tenantDraft.email && tenantDraft.fullName
  );

  const managerRequiredComplete = Boolean(
    managerDraft.propertyId && managerDraft.email && managerDraft.fullName
  );

  const ownerRequiredComplete = Boolean(
    ownerDraft.ownershipAccountId && ownerDraft.email && ownerDraft.fullName
  );

  const tenantStepComplete = (step: number) => {
    if (step === 0) return Boolean(tenantDraft.propertyId);
    if (step === 1) return Boolean(tenantDraft.email);
    if (step === 2) return Boolean(tenantDraft.fullName);
    return tenantRequiredComplete;
  };

  const managerStepComplete = (step: number) => {
    if (step === 0) return Boolean(managerDraft.propertyId);
    if (step === 1) return Boolean(managerDraft.email);
    if (step === 2) return Boolean(managerDraft.fullName);
    return managerRequiredComplete;
  };

  const ownerStepComplete = (step: number) => {
    if (step === 0) return Boolean(ownerDraft.ownershipAccountId);
    if (step === 1) return Boolean(ownerDraft.email);
    if (step === 2) return Boolean(ownerDraft.fullName);
    return ownerRequiredComplete;
  };

  const onEnterNext = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    canAdvance: boolean,
    moveNext: () => void
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canAdvance) moveNext();
  };

  useEffect(() => {
    if (!tenantState?.success || !onTenantInviteSuccess) return;
    if (handledTenantStateRef.current === tenantState) return;
    handledTenantStateRef.current = tenantState;
    setTenantDraft({ propertyId: "", email: "", fullName: "" });
    setTenantStep(0);
    setSkippedTenantSteps([]);
    onTenantInviteSuccess();
  }, [onTenantInviteSuccess, tenantState]);

  useEffect(() => {
    if (!managerState?.success || !onManagerInviteSuccess) return;
    if (handledManagerStateRef.current === managerState) return;
    handledManagerStateRef.current = managerState;
    setManagerDraft({ propertyId: "", email: "", fullName: "" });
    setManagerStep(0);
    setSkippedManagerSteps([]);
    onManagerInviteSuccess();
  }, [managerState, onManagerInviteSuccess]);

  useEffect(() => {
    if (!ownerState?.success || !onOwnerInviteSuccess) return;
    if (handledOwnerStateRef.current === ownerState) return;
    handledOwnerStateRef.current = ownerState;
    setOwnerDraft({ ownershipAccountId: "", email: "", fullName: "" });
    setOwnerStep(0);
    setSkippedOwnerSteps([]);
    onOwnerInviteSuccess();
  }, [onOwnerInviteSuccess, ownerState]);

  const renderTenantStep = () => {
    if (tenantStep === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Step 1: Pick the property first. Tenant invites are always property-linked.
          </p>
          <Select
            value={tenantDraft.propertyId}
            onChange={(event) =>
              setTenantDraft((current) => ({
                ...current,
                propertyId: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, tenantStepComplete(tenantStep), () => setTenantStep(1))}
            required
          >
            <option value="">Assign to property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    if (tenantStep === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 2: Enter tenant email address.</p>
          <Input
            type="email"
            value={tenantDraft.email}
            onChange={(event) =>
              setTenantDraft((current) => ({
                ...current,
                email: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, tenantStepComplete(tenantStep), () => setTenantStep(2))}
            placeholder="tenant@email.com"
            required
          />
        </div>
      );
    }

    if (tenantStep === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: Enter tenant full legal name.</p>
          <Input
            value={tenantDraft.fullName}
            onChange={(event) =>
              setTenantDraft((current) => ({
                ...current,
                fullName: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, tenantStepComplete(tenantStep), () => setTenantStep(3))}
            placeholder="Tenant full name"
            required
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and send tenant invite.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Property:</span> {properties.find((property) => property.id === tenantDraft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Email:</span> {tenantDraft.email || "Not set"}</p>
          <p><span className="font-semibold">Name:</span> {tenantDraft.fullName || "Not set"}</p>
        </div>
        <form className="space-y-2" action={tenantAction}>
          <input type="hidden" name="propertyId" value={tenantDraft.propertyId} />
          <input type="hidden" name="email" value={tenantDraft.email} />
          <input type="hidden" name="fullName" value={tenantDraft.fullName} />
          <SubmitButton className="w-full" disabled={!tenantRequiredComplete} title="Send tenant invitation.">
            Send Tenant Invite
          </SubmitButton>
        </form>
      </div>
    );
  };

  const renderManagerStep = () => {
    if (managerStep === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 1: Pick property for manager assignment.</p>
          <Select
            value={managerDraft.propertyId}
            onChange={(event) =>
              setManagerDraft((current) => ({
                ...current,
                propertyId: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, managerStepComplete(managerStep), () => setManagerStep(1))}
            required
          >
            <option value="">Assign to property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    if (managerStep === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 2: Enter manager email address.</p>
          <Input
            type="email"
            value={managerDraft.email}
            onChange={(event) =>
              setManagerDraft((current) => ({
                ...current,
                email: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, managerStepComplete(managerStep), () => setManagerStep(2))}
            placeholder="manager@email.com"
            required
          />
        </div>
      );
    }

    if (managerStep === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: Enter manager full name.</p>
          <Input
            value={managerDraft.fullName}
            onChange={(event) =>
              setManagerDraft((current) => ({
                ...current,
                fullName: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, managerStepComplete(managerStep), () => setManagerStep(3))}
            placeholder="Manager full name"
            required
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and send manager invite.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Property:</span> {properties.find((property) => property.id === managerDraft.propertyId)?.name ?? "Not set"}</p>
          <p><span className="font-semibold">Email:</span> {managerDraft.email || "Not set"}</p>
          <p><span className="font-semibold">Name:</span> {managerDraft.fullName || "Not set"}</p>
        </div>
        <form className="space-y-2" action={managerAction}>
          <input type="hidden" name="propertyId" value={managerDraft.propertyId} />
          <input type="hidden" name="email" value={managerDraft.email} />
          <input type="hidden" name="fullName" value={managerDraft.fullName} />
          <SubmitButton className="w-full" disabled={!managerRequiredComplete} title="Send manager invitation.">
            Send Manager Invite
          </SubmitButton>
        </form>
      </div>
    );
  };

  const renderOwnerStep = () => {
    if (ownerStep === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 1: Pick ownership account for co-owner access.</p>
          <Select
            value={ownerDraft.ownershipAccountId}
            onChange={(event) =>
              setOwnerDraft((current) => ({
                ...current,
                ownershipAccountId: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), () => setOwnerStep(1))}
            required
          >
            <option value="">Select ownership account</option>
            {ownershipAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    if (ownerStep === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 2: Enter co-owner email address.</p>
          <Input
            type="email"
            value={ownerDraft.email}
            onChange={(event) =>
              setOwnerDraft((current) => ({
                ...current,
                email: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), () => setOwnerStep(2))}
            placeholder="co-owner@email.com"
            required
          />
        </div>
      );
    }

    if (ownerStep === 2) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Step 3: Enter co-owner full name.</p>
          <Input
            value={ownerDraft.fullName}
            onChange={(event) =>
              setOwnerDraft((current) => ({
                ...current,
                fullName: event.target.value
              }))
            }
            onKeyDown={(event) => onEnterNext(event, ownerStepComplete(ownerStep), () => setOwnerStep(3))}
            placeholder="Co-owner full name"
            required
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Final step: review and send co-owner invite.</p>
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
          <p><span className="font-semibold">Account:</span> {ownershipAccounts.find((account) => account.id === ownerDraft.ownershipAccountId)?.displayName ?? "Not set"}</p>
          <p><span className="font-semibold">Email:</span> {ownerDraft.email || "Not set"}</p>
          <p><span className="font-semibold">Name:</span> {ownerDraft.fullName || "Not set"}</p>
        </div>
        <form className="space-y-2" action={ownerAction}>
          <input type="hidden" name="ownershipAccountId" value={ownerDraft.ownershipAccountId} />
          <input type="hidden" name="email" value={ownerDraft.email} />
          <input type="hidden" name="fullName" value={ownerDraft.fullName} />
          <SubmitButton className="w-full" disabled={!ownerRequiredComplete} title="Send co-owner invitation.">
            Send Co-owner Invite
          </SubmitButton>
        </form>
      </div>
    );
  };

  return (
    <div id="invitations" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invitation Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            One invitation at a time. Use Next or Enter to move forward. Skip is available, but send stays locked until required data is complete.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "tenant" ? "default" : "outline"}
              onClick={() => setActiveFlow("tenant")}
              title="Start tenant invitation workflow."
            >
              Tenant Invite
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeFlow === "manager" ? "default" : "outline"}
              onClick={() => setActiveFlow("manager")}
              title="Start manager invitation workflow."
            >
              Manager Invite
            </Button>
            {onInviteOwner && (
              <Button
                type="button"
                size="sm"
                variant={activeFlow === "owner" ? "default" : "outline"}
                onClick={() => setActiveFlow("owner")}
                title="Start co-owner invitation workflow."
              >
                Co-owner Invite
              </Button>
            )}
          </div>

          {activeFlow === "tenant" && (
            <div className="space-y-4">
              <FormError state={tenantState} />
              <FormSuccess state={tenantState} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TENANT_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={tenantStep === index}
                    done={tenantStepComplete(index)}
                    skipped={skippedTenantSteps.includes(index)}
                  />
                ))}
              </div>

              {renderTenantStep()}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTenantStep((current) => Math.max(current - 1, 0))}
                  disabled={tenantStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setTenantStep((current) => Math.min(current + 1, TENANT_STEPS.length - 1))}
                  disabled={tenantStep >= TENANT_STEPS.length - 1 || !tenantStepComplete(tenantStep)}
                  title="Complete this step and move to the next one."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedTenantSteps((previous) =>
                      previous.includes(tenantStep) ? previous : [...previous, tenantStep]
                    );
                    setTenantStep((current) => Math.min(current + 1, TENANT_STEPS.length - 1));
                  }}
                  disabled={tenantStep >= TENANT_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "manager" && (
            <div className="space-y-4">
              <FormError state={managerState} />
              <FormSuccess state={managerState} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MANAGER_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={managerStep === index}
                    done={managerStepComplete(index)}
                    skipped={skippedManagerSteps.includes(index)}
                  />
                ))}
              </div>

              {renderManagerStep()}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setManagerStep((current) => Math.max(current - 1, 0))}
                  disabled={managerStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setManagerStep((current) => Math.min(current + 1, MANAGER_STEPS.length - 1))}
                  disabled={managerStep >= MANAGER_STEPS.length - 1 || !managerStepComplete(managerStep)}
                  title="Complete this step and move to the next one."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedManagerSteps((previous) =>
                      previous.includes(managerStep) ? previous : [...previous, managerStep]
                    );
                    setManagerStep((current) => Math.min(current + 1, MANAGER_STEPS.length - 1));
                  }}
                  disabled={managerStep >= MANAGER_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {activeFlow === "owner" && onInviteOwner && (
            <div className="space-y-4">
              <FormError state={ownerState} />
              <FormSuccess state={ownerState} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {OWNER_STEPS.map((label, index) => (
                  <StepPill
                    key={label}
                    label={label}
                    active={ownerStep === index}
                    done={ownerStepComplete(index)}
                    skipped={skippedOwnerSteps.includes(index)}
                  />
                ))}
              </div>

              {renderOwnerStep()}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOwnerStep((current) => Math.max(current - 1, 0))}
                  disabled={ownerStep === 0}
                  title="Go back one step."
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setOwnerStep((current) => Math.min(current + 1, OWNER_STEPS.length - 1))}
                  disabled={ownerStep >= OWNER_STEPS.length - 1 || !ownerStepComplete(ownerStep)}
                  title="Complete this step and move to the next one."
                >
                  Next
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSkippedOwnerSteps((previous) =>
                      previous.includes(ownerStep) ? previous : [...previous, ownerStep]
                    );
                    setOwnerStep((current) => Math.min(current + 1, OWNER_STEPS.length - 1));
                  }}
                  disabled={ownerStep >= OWNER_STEPS.length - 1}
                  title="Skip this step for now and continue."
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!onInviteOwner && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Co-owner invitations are unavailable until ownership accounts are enabled.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sent Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <EmptyState message="No invitations sent yet." />
          ) : (
            <div>
              {invitations.map((inv, i) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  last={i === invitations.length - 1}
                  onResendInvite={onResendInvite}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvitationRow({
  invitation,
  last,
  onResendInvite,
}: {
  invitation: InvitationListItem;
  last: boolean;
  onResendInvite: StatefulAction;
}) {
  const [resendState, resendAction] = useFormState(onResendInvite, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          {invitation.fullName}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">{invitation.email}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={statusVariant[invitation.status] ?? "outline"}>
            {invitation.status.charAt(0).toUpperCase() +
              invitation.status.slice(1)}
          </Badge>
          <Badge variant="outline">
            {invitation.role.charAt(0).toUpperCase() +
              invitation.role.slice(1)}
          </Badge>
          {invitation.propertyName && (
            <Badge variant="outline">{invitation.propertyName}</Badge>
          )}
          {invitation.ownershipAccountName && (
            <Badge variant="outline">{invitation.ownershipAccountName}</Badge>
          )}
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">
          Sent{" "}
          {new Date(invitation.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {invitation.acceptedAt &&
            ` · Accepted ${new Date(
              invitation.acceptedAt
            ).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`}
        </p>
      </div>
      {invitation.status === "pending" && (
        <div className="flex-shrink-0">
          <form action={resendAction}>
            <input
              type="hidden"
              name="invitationId"
              value={invitation.id}
            />
            <FormError state={resendState} />
            <FormSuccess state={resendState} message="Resent!" />
            <SubmitButton variant="outline" size="sm" title="Resend this pending invitation email.">
              Resend
            </SubmitButton>
          </form>
        </div>
      )}
    </DataRow>
  );
}
