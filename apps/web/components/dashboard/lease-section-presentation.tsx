"use client";

import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { ComposeMessageModal } from "./compose-message-modal";
import { EntityEditModal } from "./entity-edit-modal";
import { ConfirmDialog } from "../shared/confirm-dialog";
import { buildEntityUpdateFormData, buildLeaseEditFields, buildTenantEditFields } from "@/lib/entity-edit-fields";
import { EmptyState } from "./empty-state";
import { AnimatedList } from "../ui/animated-list";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CardHeader, CardTitle } from "../ui/card";
import { Alert } from "../ui/alert";
import { formatCurrency, formatDate } from "@/lib/format";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";
import type { LeaseListItem } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { TenantActivityEntry } from "@/app/actions/tenant-activity";
import type { ActionState } from "@/app/actions";

export type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

export interface LeasesSectionProps {
  leases: LeaseListItem[];
  rentIncreaseHistory?: RentIncreaseEntry[];
  showControls?: boolean;
  previewCount?: number;
  onUpdateLease?: StatefulAction;
  onUpdateRentAmount?: StatefulAction;
  onUpdateTenantDisplayInfo?: StatefulAction;
  onSendMessageToTenant?: StatefulAction;
  onDeleteLease?: StatefulAction;
  onRenewLease?: StatefulAction;
  onTerminateLease?: StatefulAction;
  onCreateTenantActivity?: StatefulAction;
  onGetTenantActivityLog?: (
    tenantProfileId: string,
    propertyId: string
  ) => Promise<TenantActivityEntry[]>;
  onGoToOperations?: () => void;
  onOpenLeaseWizard?: () => void;
}

export const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Lease actions are unavailable."
});

export function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <Alert variant="error" className="mb-3">
      {state.error}
    </Alert>
  );
}

export function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <Alert variant="success" className="mb-3">
      {message}
    </Alert>
  );
}

export function LeaseStatusBadge({
  status,
  endDate
}: {
  status: LeaseListItem["leaseStatus"];
  endDate: string;
}) {
  const normalized = status ?? "active";
  const daysRemaining = Math.ceil(
    (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
  );
  let badgeStatus: string = normalized;
  let label = "Active";

  if (normalized === "terminated") {
    label = "Ended";
  } else if (normalized === "renewed") {
    label = "Renewed";
  } else if (normalized === "expired") {
    label = "Expired";
  } else if (normalized === "expiring_soon" || (normalized === "active" && daysRemaining <= 30)) {
    badgeStatus = "upcoming";
    label = "Expiring Soon";
  }

  return (
    <span
      className={statusBadgeClasses(badgeStatus)}
      aria-label={statusAriaLabel(badgeStatus, "Lease status", label)}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(badgeStatus).dot}`} />
      {label}
    </span>
  );
}

export function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addYears(dateIso: string, years: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}


interface LeaseSectionHeadingProps {
  showControls: boolean;
  onOpenLeaseWizard?: () => void;
  updateState: ActionState;
  rentAmountState: ActionState;
  deleteState: ActionState;
  renewState: ActionState;
  terminateState: ActionState;
}

export function LeaseSectionHeading({
  showControls, onOpenLeaseWizard, updateState, rentAmountState,
  deleteState, renewState, terminateState
}: LeaseSectionHeadingProps) {
  return (
    <>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-xl font-semibold">Leases</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keep lease terms, renewals, and tenant assignments in one place.
          </p>
        </div>
        {showControls && onOpenLeaseWizard ? (
          <Button
            type="button"
            onClick={onOpenLeaseWizard}
            className="w-full sm:w-auto"
            title="Open the guided lease creation wizard."
          >
            New Lease
          </Button>
        ) : null}
      </CardHeader>
        {showControls ? (
          <>
            <FormError state={updateState} />
            <FormError state={rentAmountState} />
            <FormError state={deleteState} />
            <FormError state={renewState} />
            <FormError state={terminateState} />
            <FormSuccess state={updateState} message="Lease updated." />
            <FormSuccess state={rentAmountState} message="Recurring rent amount updated." />
            <FormSuccess state={deleteState} message="Lease archived." />
            <FormSuccess state={renewState} message="Lease renewed." />
            <FormSuccess state={terminateState} message="Lease ended." />
          </>
        ) : null}
    </>
  );
}

export function LeaseRentHistory({ rentIncreaseHistory }: { rentIncreaseHistory: RentIncreaseEntry[] }) {
  return (
    <>
            {rentIncreaseHistory.length > 0 ? (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-medium text-foreground">Rent Increase History</p>
                    <p className="text-sm text-muted-foreground">
                      Recent renewal-driven rent changes across your portfolio.
                    </p>
                  </div>
                  <Badge variant="outline">{rentIncreaseHistory.length}</Badge>
                </div>
                <AnimatedList className="space-y-3">
                  {rentIncreaseHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {entry.tenantName} • {entry.propertyName} • {entry.unitNumber}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Effective {formatDate(entry.effectiveDate)}
                          {entry.reason ? ` • ${entry.reason}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-semibold text-foreground">
                          {formatCurrency(entry.previousRentCents)} → {formatCurrency(entry.newRentCents)}
                        </p>
                        <p
                          className={`text-xs font-medium ${
                            entry.changePercent >= 0 ? "text-[var(--pos)]" : "text-[var(--crit)]"
                          }`}
                        >
                          {entry.changePercent >= 0 ? "+" : ""}
                          {entry.changePercent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </AnimatedList>
              </div>
            ) : null}
    </>
  );
}

interface LeaseListPreviewControlProps {
  hasMore: boolean;
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  leaseCount: number;
}

export function LeaseListPreviewControl({
  hasMore, expanded, setExpanded, leaseCount
}: LeaseListPreviewControlProps) {
  const leases = { length: leaseCount };
  return (
    <>
            {hasMore ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? "Collapse the lease list preview." : "Show the full lease list."}
                >
                  {expanded ? "Show Less" : `View All Leases (${leases.length})`}
                </Button>
              </div>
            ) : null}

    </>
  );
}

export function LeaseEmptyState({
  onOpenLeaseWizard,
  onGoToOperations
}: {
  onOpenLeaseWizard?: () => void;
  onGoToOperations?: () => void;
}) {
  return (
          <EmptyState
            icon={FileText}
            title="No leases yet"
            description="Create a lease to start tracking rent and tenant information."
            actionLabel={onOpenLeaseWizard || onGoToOperations ? "Create a Lease" : undefined}
            onAction={onOpenLeaseWizard ?? onGoToOperations}
          />
  );
}

interface LeaseModalsProps {
  confirmDeleteLeaseId: string | null;
  setConfirmDeleteLeaseId: Dispatch<SetStateAction<string | null>>;
  deleteFormRefs: { current: Record<string, HTMLFormElement | null> };
  editingLease: LeaseListItem | null;
  setEditingLease: Dispatch<SetStateAction<LeaseListItem | null>>;
  editingTenant: LeaseListItem | null;
  setEditingTenant: Dispatch<SetStateAction<LeaseListItem | null>>;
  messagingTenant: LeaseListItem | null;
  setMessagingTenant: Dispatch<SetStateAction<LeaseListItem | null>>;
  onUpdateLease?: StatefulAction;
  onUpdateTenantDisplayInfo?: StatefulAction;
  onSendMessageToTenant?: StatefulAction;
}

export function LeaseModals({
  confirmDeleteLeaseId, setConfirmDeleteLeaseId, deleteFormRefs,
  editingLease, setEditingLease, editingTenant, setEditingTenant,
  messagingTenant, setMessagingTenant, onUpdateLease,
  onUpdateTenantDisplayInfo, onSendMessageToTenant
}: LeaseModalsProps) {
  const router = useRouter();
  return (
    <>
      <ConfirmDialog
        title="Archive Lease?"
        description="Are you sure? This will archive the lease and mark the unit as no longer occupied."
        confirmLabel="Archive Lease"
        open={confirmDeleteLeaseId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteLeaseId(null);
          }
        }}
        onConfirm={() => {
          if (!confirmDeleteLeaseId) return;
          deleteFormRefs.current[confirmDeleteLeaseId]?.requestSubmit();
        }}
      />
      {editingLease && onUpdateLease ? (
        <EntityEditModal
          open
          onClose={() => setEditingLease(null)}
          title="Edit Lease"
          entityType="lease"
          fields={buildLeaseEditFields(editingLease)}
          onSave={async (updates) => {
            const result = await onUpdateLease(
              null,
              buildEntityUpdateFormData({ leaseId: editingLease.id }, updates)
            );
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "Lease updated." };
            }
            return { error: result?.error ?? "Unable to update this lease right now." };
          }}
        />
      ) : null}
      {editingTenant && onUpdateTenantDisplayInfo ? (
        <EntityEditModal
          open
          onClose={() => setEditingTenant(null)}
          title="Edit Tenant"
          entityType="tenant"
          fields={buildTenantEditFields({
            fullName: editingTenant.tenantName,
            email: editingTenant.tenantEmail,
            phone: editingTenant.tenantPhone
          })}
          onSave={async (updates) => {
            const result = await onUpdateTenantDisplayInfo(
              null,
              buildEntityUpdateFormData({ profileId: editingTenant.tenantProfileId }, updates)
            );
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "Tenant details updated." };
            }
            return { error: result?.error ?? "Unable to update this tenant right now." };
          }}
        />
      ) : null}
      {messagingTenant && onSendMessageToTenant ? (
        <ComposeMessageModal
          open
          onClose={() => setMessagingTenant(null)}
          recipientName={messagingTenant.tenantName}
          recipientProfileId={messagingTenant.tenantProfileId}
          propertyId={messagingTenant.propertyId}
          propertyName={`${messagingTenant.propertyName ?? "Property"} · ${messagingTenant.unitLabel}`}
          prefilledSubject={`Message about ${messagingTenant.propertyName ?? "your lease"}`}
          onSend={onSendMessageToTenant}
        />
      ) : null}
    </>
  );
}
