"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
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
  properties: PropertyOption[];
  invitations: InvitationListItem[];
  onInviteTenant: StatefulAction;
  onInviteManager: StatefulAction;
  onResendInvite: StatefulAction;
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
  properties,
  invitations,
  onInviteTenant,
  onInviteManager,
  onResendInvite,
}: InvitationsSectionProps) {
  const [tenantState, tenantAction] = useFormState(onInviteTenant, null);
  const [managerState, managerAction] = useFormState(onInviteManager, null);

  return (
    <div id="invitations">
      {/* Invite forms — 2-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-4">
        {/* Invite Tenant */}
        <Card>
          <CardHeader>
            <CardTitle>Invite Tenant</CardTitle>
          </CardHeader>
          <CardContent>
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
              <SubmitButton className="w-full">Send Invitation</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {/* Invite Manager */}
        <Card>
          <CardHeader>
            <CardTitle>Invite Manager</CardTitle>
          </CardHeader>
          <CardContent>
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
              <SubmitButton className="w-full">Send Invitation</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

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
            <SubmitButton variant="outline" size="sm">
              Resend
            </SubmitButton>
          </form>
        </div>
      )}
    </DataRow>
  );
}
