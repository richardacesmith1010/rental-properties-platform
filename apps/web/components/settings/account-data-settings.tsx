"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface AccountDataSettingsProps {
  onDeleteAllProperties: StatefulAction;
  onDeleteAllTenants: StatefulAction;
  onDeleteAllManagers: StatefulAction;
  onDeleteAllLeases: StatefulAction;
  onDeleteAllFinancialData: StatefulAction;
  onFullAccountWipe: StatefulAction;
}

interface DangerActionCardProps {
  title: string;
  description: string;
  actionLabel: string;
  action: StatefulAction;
  prominent?: boolean;
}

function DangerActionCard({
  title,
  description,
  actionLabel,
  action,
  prominent = false
}: DangerActionCardProps) {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction] = useFormState(action, null);
  const disabled = confirmation !== "DELETE";

  useEffect(() => {
    if (state?.success) {
      setConfirmation("");
    }
  }, [state]);

  return (
    <Card
      className="border shadow-sm"
      style={{
        backgroundColor: "var(--domus-danger-bg)",
        borderColor: "var(--domus-danger-text)",
        boxShadow: prominent ? "0 0 0 1px var(--domus-danger-text) inset" : undefined
      }}
    >
      <CardHeader>
        <CardTitle
          className="flex items-center gap-2"
          style={{ color: "var(--domus-danger-text)" }}
        >
          {prominent ? <Trash2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-sm"
          style={{ color: "var(--domus-danger-text)" }}
        >
          {description}
        </p>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <label
              className="block text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--domus-danger-text)" }}
            >
              Type DELETE to confirm
            </label>
            <Input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
              className="text-foreground"
              style={{
                backgroundColor: "var(--domus-input-bg)",
                borderColor: "var(--domus-input-border)",
                color: "var(--domus-heading-text)"
              }}
              title={`Type DELETE to confirm ${title.toLowerCase()}.`}
            />
          </div>
          {state && !state.success ? <Alert variant="error">{state.error}</Alert> : null}
          {state?.success ? <Alert variant="success">{state.message ?? "Action completed."}</Alert> : null}
          <SubmitButton
            variant="destructive"
            disabled={disabled}
            title={disabled ? 'Type "DELETE" first.' : `Confirm ${title.toLowerCase()}.`}
          >
            {actionLabel}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountDataSettings({
  onDeleteAllProperties,
  onDeleteAllTenants,
  onDeleteAllManagers,
  onDeleteAllLeases,
  onDeleteAllFinancialData,
  onFullAccountWipe
}: AccountDataSettingsProps) {
  return (
    <div className="space-y-4">
      <DangerActionCard
        title="Delete All Properties"
        description="This will deactivate all your properties, units, leases, charges, payments, expenses, files, maintenance tickets, and vendors."
        actionLabel="Delete Properties"
        action={onDeleteAllProperties}
      />
      <DangerActionCard
        title="Remove All Tenants"
        description="This will remove all tenant invitations and delete tenant-linked leases."
        actionLabel="Remove Tenants"
        action={onDeleteAllTenants}
      />
      <DangerActionCard
        title="Remove All Property Managers"
        description="This will remove all manager assignments and manager invitations."
        actionLabel="Remove Managers"
        action={onDeleteAllManagers}
      />
      <DangerActionCard
        title="Delete All Leases"
        description="This will delete all leases, rent charges, payments, and autopay enrollments."
        actionLabel="Delete Leases"
        action={onDeleteAllLeases}
      />
      <DangerActionCard
        title="Delete All Financial Data"
        description="This will clear all expenses, payment distributions, rent charges, and payments."
        actionLabel="Delete Financial Data"
        action={onDeleteAllFinancialData}
      />
      <DangerActionCard
        title="Full Account Wipe"
        description="This will delete ALL data from your account. This cannot be undone."
        actionLabel="Wipe Account"
        action={onFullAccountWipe}
        prominent
      />
    </div>
  );
}
