"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { Download, FileText, MessageSquare, Pencil } from "lucide-react";
import { DataRow } from "@/components/shared/data-row";
import { ComposeMessageModal } from "@/components/dashboard/compose-message-modal";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AnimatedList } from "@/components/ui/animated-list";
import type { LeaseListItem } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";
import {
  buildEntityUpdateFormData,
  buildLeaseEditFields,
  buildTenantEditFields
} from "@/lib/entity-edit-fields";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface LeasesSectionProps {
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
  onGoToOperations?: () => void;
  onOpenLeaseWizard?: () => void;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Lease actions are unavailable."
});

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <Alert variant="error" className="mb-3">
      {state.error}
    </Alert>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <Alert variant="success" className="mb-3">
      {message}
    </Alert>
  );
}

function LeaseStatusBadge({
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

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYears(dateIso: string, years: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function LeasesSection({
  leases,
  rentIncreaseHistory = [],
  showControls = false,
  previewCount,
  onUpdateLease,
  onUpdateRentAmount,
  onUpdateTenantDisplayInfo,
  onSendMessageToTenant,
  onDeleteLease,
  onRenewLease,
  onTerminateLease,
  onGoToOperations,
  onOpenLeaseWizard
}: LeasesSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [updateState, updateAction] = useFormState(onUpdateLease ?? unavailableAction, null);
  const [rentAmountState, updateRentAmountAction] = useFormState(onUpdateRentAmount ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteLease ?? unavailableAction, null);
  const [renewState, renewAction] = useFormState(onRenewLease ?? unavailableAction, null);
  const [terminateState, terminateAction] = useFormState(onTerminateLease ?? unavailableAction, null);
  const [activeEditLeaseId, setActiveEditLeaseId] = useState<string | null>(null);
  const [activeRentAmountLeaseId, setActiveRentAmountLeaseId] = useState<string | null>(null);
  const [activeRenewLeaseId, setActiveRenewLeaseId] = useState<string | null>(null);
  const [activeTerminateLeaseId, setActiveTerminateLeaseId] = useState<string | null>(null);
  const [editingLease, setEditingLease] = useState<LeaseListItem | null>(null);
  const [editingTenant, setEditingTenant] = useState<LeaseListItem | null>(null);
  const [messagingTenant, setMessagingTenant] = useState<LeaseListItem | null>(null);
  const [confirmDeleteLeaseId, setConfirmDeleteLeaseId] = useState<string | null>(null);
  const deleteFormRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const visibleLeases = previewCount && !expanded ? leases.slice(0, previewCount) : leases;
  const hasMore = previewCount != null && leases.length > previewCount;

  useEffect(() => {
    if (
      updateState?.success ||
      rentAmountState?.success ||
      deleteState?.success ||
      renewState?.success ||
      terminateState?.success
    ) {
      setActiveEditLeaseId(null);
      setActiveRentAmountLeaseId(null);
      setActiveRenewLeaseId(null);
      setActiveTerminateLeaseId(null);
      setEditingLease(null);
      setEditingTenant(null);
      setMessagingTenant(null);
      setConfirmDeleteLeaseId(null);
    }
  }, [deleteState, renewState, rentAmountState, terminateState, updateState]);

  return (
    <Card id="leases" className="border border-border/50 shadow-sm">
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
      <CardContent>
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

        {leases.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No leases yet"
            description="Create a lease to start tracking rent and tenant information."
            actionLabel={onOpenLeaseWizard || onGoToOperations ? "Create a Lease" : undefined}
            onAction={onOpenLeaseWizard ?? onGoToOperations}
          />
        ) : (
          <div className="space-y-6">
            <AnimatedList className="space-y-6">
            {visibleLeases.map((lease, i) => {
              const isActiveLease = (lease.leaseStatus ?? "active") === "active";
              return (
                <DataRow key={lease.id} last={i === visibleLeases.length - 1}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-medium text-foreground">{lease.unitLabel}</p>
                      <LeaseStatusBadge status={lease.leaseStatus} endDate={lease.endDate} />
                      {showControls && onUpdateLease ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 rounded-md sm:h-8 sm:w-8"
                          onClick={() => setEditingLease(lease)}
                          title={`Edit lease for ${lease.unitLabel}`}
                          aria-label={`Edit lease for ${lease.unitLabel}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{lease.tenantName}</span>
                      {showControls && onUpdateTenantDisplayInfo ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 rounded-md sm:h-7 sm:w-7"
                          onClick={() => setEditingTenant(lease)}
                          title={`Edit ${lease.tenantName}`}
                          aria-label={`Edit ${lease.tenantName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {showControls && onSendMessageToTenant ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 rounded-md sm:h-7 sm:w-7"
                          onClick={() => setMessagingTenant(lease)}
                          title={`Message ${lease.tenantName}`}
                          aria-label={`Message ${lease.tenantName}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {lease.tenantEmail}
                      {lease.tenantPhone ? ` • ${lease.tenantPhone}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {lease.gracePeriodDays}-day grace • {formatCurrency(lease.lateFeeCents)} late fee
                    </p>

                    {showControls && isActiveLease && activeRentAmountLeaseId === lease.id ? (
                      <form action={updateRentAmountAction} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="leaseId" value={lease.id} />
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-muted-foreground" htmlFor={`lease-rent-amount-${lease.id}`}>
                            New Rent Amount
                          </label>
                          <Input
                            id={`lease-rent-amount-${lease.id}`}
                            name="monthlyRentDollars"
                            type="number"
                            min={1}
                            step="0.01"
                            defaultValue={lease.monthlyRentCents / 100}
                            required
                          />
                        </div>
                        <SubmitButton size="sm" variant="outline" title="Save the recurring rent amount for future charge generation.">
                          Save Rent Amount
                        </SubmitButton>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setActiveRentAmountLeaseId(null)}
                          title="Cancel rent amount editing."
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : null}

                    {showControls && isActiveLease && activeEditLeaseId === lease.id ? (
                      <div className="mt-3 space-y-4">
                        <form action={updateAction} className="grid gap-2 sm:grid-cols-3">
                          <input type="hidden" name="leaseId" value={lease.id} />
                          <Input
                            name="monthlyRentDollars"
                            type="number"
                            min={1}
                            step="0.01"
                            defaultValue={lease.monthlyRentCents / 100}
                            required
                          />
                          <Input
                            name="depositDollars"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={lease.depositCents / 100}
                            required
                          />
                          <Input
                            name="dueDayOfMonth"
                            type="number"
                            min={1}
                            max={28}
                            defaultValue={lease.dueDayOfMonth}
                            required
                          />
                          <Input
                            name="gracePeriodDays"
                            type="number"
                            min={0}
                            max={30}
                            defaultValue={lease.gracePeriodDays}
                            required
                          />
                          <Input
                            name="lateFeeDollars"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={lease.lateFeeCents / 100}
                            required
                          />
                          <Input
                            name="endDate"
                            type="date"
                            defaultValue={lease.endDate}
                            required
                          />
                          <div className="sm:col-span-3">
                            <SubmitButton size="sm" variant="outline" title="Save lease term updates for this tenant.">
                              Save Lease Changes
                            </SubmitButton>
                          </div>
                        </form>

                        {isActiveLease ? (
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-base font-medium text-foreground">Renew Lease</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={activeRenewLeaseId === lease.id ? "default" : "outline"}
                                  onClick={() =>
                                    setActiveRenewLeaseId((current) => (current === lease.id ? null : lease.id))
                                  }
                                  title="Open renewal fields for this lease."
                                >
                                  {activeRenewLeaseId === lease.id ? "Hide" : "Renew"}
                                </Button>
                              </div>
                              {activeRenewLeaseId === lease.id ? (
                                <form action={renewAction} className="space-y-2">
                                  <input type="hidden" name="leaseId" value={lease.id} />
                                  <Input
                                    name="newStartDate"
                                    type="date"
                                    defaultValue={addDays(lease.endDate, 1)}
                                    required
                                  />
                                  <Input
                                    name="newEndDate"
                                    type="date"
                                    defaultValue={addYears(lease.endDate, 1)}
                                    required
                                  />
                                  <Input
                                    name="newMonthlyRentDollars"
                                    type="number"
                                    min={0.01}
                                    step="0.01"
                                    defaultValue={lease.monthlyRentCents / 100}
                                    required
                                  />
                                  <Input
                                    name="newDueDayOfMonth"
                                    type="number"
                                    min={1}
                                    max={28}
                                    defaultValue={lease.dueDayOfMonth}
                                    required
                                  />
                                  <SubmitButton size="sm" title="Create the renewed lease and close the current one.">
                                    Confirm Renewal
                                  </SubmitButton>
                                </form>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-rose-200/80 bg-rose-50 p-4 shadow-sm">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-base font-medium text-rose-900">End Lease</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={activeTerminateLeaseId === lease.id ? "destructive" : "outline"}
                                  onClick={() =>
                                    setActiveTerminateLeaseId((current) => (current === lease.id ? null : lease.id))
                                  }
                                  title="Open lease end controls."
                                >
                                  {activeTerminateLeaseId === lease.id ? "Hide" : "End Lease"}
                                </Button>
                              </div>
                              {activeTerminateLeaseId === lease.id ? (
                                <form action={terminateAction} className="space-y-2">
                                  <input type="hidden" name="leaseId" value={lease.id} />
                                  <Textarea
                                    name="terminationReason"
                                    rows={3}
                                    placeholder="Add a note about why this lease is ending."
                                    required
                                  />
                                  <SubmitButton
                                    size="sm"
                                    variant="destructive"
                                    title="End this lease and mark the unit as no longer occupied."
                                  >
                                    Confirm Lease End
                                  </SubmitButton>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <div className="text-left sm:text-right">
                      <p className="text-base font-medium text-foreground">{formatCurrency(lease.monthlyRentCents)}</p>
                      <p className="text-sm text-muted-foreground">Due day {lease.dueDayOfMonth}</p>
                    </div>
                    <Link
                      href={`/api/pdf/lease-summary/${lease.id}`}
                      className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted sm:min-h-0"
                      title="Download a one-page PDF summary of this lease."
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF Summary
                    </Link>

                    {showControls && isActiveLease ? (
                      <>
                        {onUpdateRentAmount ? (
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            variant={activeRentAmountLeaseId === lease.id ? "default" : "outline"}
                            onClick={() =>
                              setActiveRentAmountLeaseId((current) => (current === lease.id ? null : lease.id))
                            }
                            title="Edit the recurring rent amount used for future charges."
                          >
                            {activeRentAmountLeaseId === lease.id ? "Hide Rent Editor" : "Edit Rent Amount"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="w-full sm:w-auto"
                          variant={activeEditLeaseId === lease.id ? "default" : "outline"}
                          onClick={() =>
                            setActiveEditLeaseId((current) => (current === lease.id ? null : lease.id))
                          }
                          title={
                            activeEditLeaseId === lease.id
                              ? "Hide lease edit controls."
                              : "Open lease edit controls."
                          }
                        >
                          {activeEditLeaseId === lease.id ? "Done" : "Manage"}
                        </Button>
                        {activeEditLeaseId === lease.id ? (
                          <form
                            action={deleteAction}
                            ref={(node) => {
                              deleteFormRefs.current[lease.id] = node;
                            }}
                          >
                            <input type="hidden" name="leaseId" value={lease.id} />
                            <SubmitButton
                              size="sm"
                              variant="destructive"
                              onClick={(event) => {
                                event.preventDefault();
                                setConfirmDeleteLeaseId(lease.id);
                              }}
                              title="Archive this lease and free the unit."
                            >
                              Archive
                            </SubmitButton>
                          </form>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </DataRow>
              );
            })}
            </AnimatedList>
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
                            entry.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
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
          </div>
        )}
      </CardContent>
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
    </Card>
  );
}
