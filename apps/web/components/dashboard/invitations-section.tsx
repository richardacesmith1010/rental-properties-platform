"use client";

import { useEffect, useRef, useState } from "react";
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

interface PropertyOption {
  id: string;
  name: string;
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

/* Reuse the same feedback components from operations-section */
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

const statusVariant: Record<string, "warning" | "success" | "outline"> = {
  pending: "warning",
  accepted: "success",
  expired: "outline",
};

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
  const [activeInviteForm, setActiveInviteForm] = useState<"tenant" | "manager" | "owner" | null>(null);
  const handledTenantStateRef = useRef<ActionState>(null);
  const handledManagerStateRef = useRef<ActionState>(null);
  const handledOwnerStateRef = useRef<ActionState>(null);

  useEffect(() => {
    if (!tenantState?.success || !onTenantInviteSuccess) return;
    if (handledTenantStateRef.current === tenantState) return;
    handledTenantStateRef.current = tenantState;
    setActiveInviteForm(null);
    onTenantInviteSuccess();
  }, [onTenantInviteSuccess, tenantState]);

  useEffect(() => {
    if (!managerState?.success || !onManagerInviteSuccess) return;
    if (handledManagerStateRef.current === managerState) return;
    handledManagerStateRef.current = managerState;
    setActiveInviteForm(null);
    onManagerInviteSuccess();
  }, [managerState, onManagerInviteSuccess]);

  useEffect(() => {
    if (!ownerState?.success || !onOwnerInviteSuccess) return;
    if (handledOwnerStateRef.current === ownerState) return;
    handledOwnerStateRef.current = ownerState;
    setActiveInviteForm(null);
    onOwnerInviteSuccess();
  }, [onOwnerInviteSuccess, ownerState]);

  return (
    <div id="invitations">
      {/* Invite forms — 2-column grid */}
      <div className={`mb-4 grid grid-cols-1 gap-4 ${onInviteOwner ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {/* Invite Tenant */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Invite Tenant</CardTitle>
              <Button
                type="button"
                size="sm"
                variant={activeInviteForm === "tenant" ? "default" : "outline"}
                onClick={() =>
                  setActiveInviteForm((current) => (current === "tenant" ? null : "tenant"))
                }
                title={
                  activeInviteForm === "tenant"
                    ? "Hide tenant invitation form."
                    : "Open tenant invitation form."
                }
              >
                {activeInviteForm === "tenant" ? "Done" : "Manage"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeInviteForm === "tenant" ? (
              <form className="space-y-3" action={tenantAction}>
                <FormError state={tenantState} />
                <FormSuccess state={tenantState} />
                <Input
                  name="email"
                  type="email"
                  placeholder="Tenant email"
                  required
                />
                <Input name="fullName" placeholder="Full name" required />
                <Select name="propertyId" required>
                  <option value="">Assign to property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                <SubmitButton className="w-full" title="Email an invitation link to this tenant.">
                  Send Invitation
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-zinc-500">
                Invitation form hidden. Click Manage to send a tenant invite.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Invite Manager */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Invite Manager</CardTitle>
              <Button
                type="button"
                size="sm"
                variant={activeInviteForm === "manager" ? "default" : "outline"}
                onClick={() =>
                  setActiveInviteForm((current) => (current === "manager" ? null : "manager"))
                }
                title={
                  activeInviteForm === "manager"
                    ? "Hide manager invitation form."
                    : "Open manager invitation form."
                }
              >
                {activeInviteForm === "manager" ? "Done" : "Manage"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeInviteForm === "manager" ? (
              <form className="space-y-3" action={managerAction}>
                <FormError state={managerState} />
                <FormSuccess state={managerState} />
                <Input
                  name="email"
                  type="email"
                  placeholder="Manager email"
                  required
                />
                <Input name="fullName" placeholder="Full name" required />
                <Select name="propertyId" required>
                  <option value="">Assign to property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                <SubmitButton className="w-full" title="Email an invitation and assign this manager to the selected property.">
                  Send Invitation
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-zinc-500">
                Invitation form hidden. Click Manage to invite a manager.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Invite Co-owner */}
        {onInviteOwner && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Invite Co-owner</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant={activeInviteForm === "owner" ? "default" : "outline"}
                  onClick={() =>
                    setActiveInviteForm((current) => (current === "owner" ? null : "owner"))
                  }
                  title={
                    activeInviteForm === "owner"
                      ? "Hide co-owner invitation form."
                      : "Open co-owner invitation form."
                  }
                >
                  {activeInviteForm === "owner" ? "Done" : "Manage"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeInviteForm === "owner" ? (
                <form className="space-y-3" action={ownerAction}>
                  <FormError state={ownerState} />
                  <FormSuccess state={ownerState} />
                  <Input
                    name="email"
                    type="email"
                    placeholder="Co-owner email"
                    required
                  />
                  <Input name="fullName" placeholder="Full name" required />
                  <Select name="ownershipAccountId" required>
                    <option value="">Select ownership account</option>
                    {ownershipAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton className="w-full" title="Email an invitation to join this ownership account as a co-owner.">
                    Send Invitation
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-zinc-500">
                  Invitation form hidden. Click Manage to invite a co-owner.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {!onInviteOwner && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Co-owner invitations are unavailable until ownership accounts are enabled.
        </div>
      )}

      {/* Sent Invitations listing */}
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
