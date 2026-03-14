"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { FileText } from "lucide-react";
import { DataRow } from "@/components/shared/data-row";
import { SubmitButton } from "@/components/shared/submit-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { AnimatedList } from "@/components/ui/animated-list";
import type { LeaseListItem } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface LeasesSectionProps {
  leases: LeaseListItem[];
  rentIncreaseHistory?: RentIncreaseEntry[];
  showControls?: boolean;
  onUpdateLease?: StatefulAction;
  onDeleteLease?: StatefulAction;
  onRenewLease?: StatefulAction;
  onTerminateLease?: StatefulAction;
  onGoToOperations?: () => void;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Lease actions are unavailable."
});

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
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

  if (normalized === "terminated") {
    return <Badge variant="destructive">Terminated</Badge>;
  }
  if (normalized === "renewed") {
    return <Badge variant="default">Renewed</Badge>;
  }
  if (normalized === "expired") {
    return <Badge variant="warning">Expired</Badge>;
  }
  if (normalized === "expiring_soon" || (normalized === "active" && daysRemaining <= 30)) {
    return <Badge variant="warning">Expiring Soon</Badge>;
  }

  return <Badge variant="success">Active</Badge>;
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
  onUpdateLease,
  onDeleteLease,
  onRenewLease,
  onTerminateLease,
  onGoToOperations
}: LeasesSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateLease ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteLease ?? unavailableAction, null);
  const [renewState, renewAction] = useFormState(onRenewLease ?? unavailableAction, null);
  const [terminateState, terminateAction] = useFormState(onTerminateLease ?? unavailableAction, null);
  const [activeEditLeaseId, setActiveEditLeaseId] = useState<string | null>(null);
  const [activeRenewLeaseId, setActiveRenewLeaseId] = useState<string | null>(null);
  const [activeTerminateLeaseId, setActiveTerminateLeaseId] = useState<string | null>(null);
  const [confirmDeleteLeaseId, setConfirmDeleteLeaseId] = useState<string | null>(null);
  const deleteFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

  useEffect(() => {
    if (updateState?.success || deleteState?.success || renewState?.success || terminateState?.success) {
      setActiveEditLeaseId(null);
      setActiveRenewLeaseId(null);
      setActiveTerminateLeaseId(null);
      setConfirmDeleteLeaseId(null);
    }
  }, [deleteState, renewState, terminateState, updateState]);

  return (
    <Card id="leases">
      <CardHeader>
        <CardTitle>Leases</CardTitle>
      </CardHeader>
      <CardContent>
        {showControls ? (
          <>
            <FormError state={updateState} />
            <FormError state={deleteState} />
            <FormError state={renewState} />
            <FormError state={terminateState} />
            <FormSuccess state={updateState} message="Lease updated." />
            <FormSuccess state={deleteState} message="Lease archived." />
            <FormSuccess state={renewState} message="Lease renewed." />
            <FormSuccess state={terminateState} message="Lease terminated." />
          </>
        ) : null}

        {leases.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No leases yet"
            description="Create a lease to start collecting rent."
            actionLabel={onGoToOperations ? "Go to Operations" : undefined}
            onAction={onGoToOperations}
          />
        ) : (
          <div className="space-y-6">
            <AnimatedList className="space-y-6">
            {leases.map((lease, i) => {
              const isActiveLease = (lease.leaseStatus ?? "active") === "active";
              return (
                <DataRow key={lease.id} last={i === leases.length - 1}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{lease.unitLabel}</p>
                      <LeaseStatusBadge status={lease.leaseStatus} endDate={lease.endDate} />
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{lease.tenantEmail}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {lease.gracePeriodDays}-day grace • {formatCurrency(lease.lateFeeCents)} late fee
                    </p>

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
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-zinc-900">Renew Lease</p>
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

                            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-rose-900">Terminate Lease</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={activeTerminateLeaseId === lease.id ? "destructive" : "outline"}
                                  onClick={() =>
                                    setActiveTerminateLeaseId((current) => (current === lease.id ? null : lease.id))
                                  }
                                  title="Open termination controls for this lease."
                                >
                                  {activeTerminateLeaseId === lease.id ? "Hide" : "Terminate"}
                                </Button>
                              </div>
                              {activeTerminateLeaseId === lease.id ? (
                                <form action={terminateAction} className="space-y-2">
                                  <input type="hidden" name="leaseId" value={lease.id} />
                                  <Textarea
                                    name="terminationReason"
                                    rows={3}
                                    placeholder="Document why this lease is being terminated."
                                    required
                                  />
                                  <SubmitButton
                                    size="sm"
                                    variant="destructive"
                                    title="Terminate this lease and mark the unit as no longer occupied."
                                  >
                                    Confirm Termination
                                  </SubmitButton>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-900">{formatCurrency(lease.monthlyRentCents)}</p>
                      <p className="text-xs text-zinc-500">Due day {lease.dueDayOfMonth}</p>
                    </div>

                    {showControls && isActiveLease ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
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

            {rentIncreaseHistory.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Rent Increase History</p>
                    <p className="text-xs text-zinc-500">
                      Recent renewal-driven rent changes across your portfolio.
                    </p>
                  </div>
                  <Badge variant="outline">{rentIncreaseHistory.length}</Badge>
                </div>
                <AnimatedList className="space-y-3">
                  {rentIncreaseHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">
                          {entry.tenantName} • {entry.propertyName} • Unit {entry.unitNumber}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Effective {formatDate(entry.effectiveDate)}
                          {entry.reason ? ` • ${entry.reason}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-semibold text-zinc-900">
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
    </Card>
  );
}
