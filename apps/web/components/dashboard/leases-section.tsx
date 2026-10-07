"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { ClipboardList, Download, MessageSquare, Pencil } from "lucide-react";
import { DataRow } from "../shared/data-row";
import { TenantActivityTimeline } from "./tenant-activity-timeline";
import { SubmitButton } from "../shared/submit-button";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { AnimatedList } from "../ui/animated-list";
import {
  LeaseCollectionSetting,
  PaysOutsideDomusBadge
} from "./lease-collection-setting";
import type { LeaseListItem } from "@/lib/portfolio";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  LeaseModals, LeaseStatusBadge, addDays, addYears, unavailableAction,
  LeaseRentHistory, LeaseSectionHeading, LeaseListPreviewControl,
  LeaseEmptyState, type LeasesSectionProps
} from "./lease-section-presentation";

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
  onCreateTenantActivity,
  onGetTenantActivityLog,
  onGoToOperations,
  onOpenLeaseWizard
}: LeasesSectionProps) {
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
  const [activeActivityLeaseId, setActiveActivityLeaseId] = useState<string | null>(null);
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
      <LeaseSectionHeading
        showControls={showControls}
        onOpenLeaseWizard={onOpenLeaseWizard}
        updateState={updateState}
        rentAmountState={rentAmountState}
        deleteState={deleteState}
        renewState={renewState}
        terminateState={terminateState}
      />
      <CardContent>
        {leases.length === 0 ? (
          <LeaseEmptyState onOpenLeaseWizard={onOpenLeaseWizard} onGoToOperations={onGoToOperations} />
        ) : (
          <div className="space-y-6">
            <AnimatedList className="space-y-6">
            {visibleLeases.map((lease, i) => {
              const isActiveLease = (lease.leaseStatus ?? "active") === "active";
              const isActivityOpen = activeActivityLeaseId === lease.id;

              return (
                <div key={lease.id} className="space-y-3">
                  <DataRow last={i === visibleLeases.length - 1}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-medium text-foreground">{lease.unitLabel}</p>
                        <LeaseStatusBadge status={lease.leaseStatus} endDate={lease.endDate} />
                        {lease.collectsOutsideDomus ? <PaysOutsideDomusBadge /> : null}
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
                        {showControls && onCreateTenantActivity && onGetTenantActivityLog ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={isActivityOpen ? "default" : "ghost"}
                            className="h-8 px-2 text-xs"
                            onClick={() =>
                              setActiveActivityLeaseId((current) => (current === lease.id ? null : lease.id))
                            }
                            title={
                              isActivityOpen
                                ? `Hide activity for ${lease.tenantName}`
                                : `Show activity for ${lease.tenantName}`
                            }
                          >
                            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                            {isActivityOpen ? "Hide Activity" : "Activity"}
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
                          <SubmitButton size="sm" variant="outline" title="Save the recurring rent amount for future payment generation.">
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
                              <LeaseCollectionSetting
                                id={`lease-collects-outside-domus-${lease.id}`}
                                name="collectsOutsideDomus"
                                defaultChecked={lease.collectsOutsideDomus}
                              />
                            </div>
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

                              <div className="rounded-2xl border border-[var(--crit)] bg-[var(--crit-bg)] p-4 shadow-sm">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                  <p className="text-base font-medium text-[var(--crit)]">End Lease</p>
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
                        className={[
                          "inline-flex min-h-11 items-center justify-center gap-1 rounded-md",
                          "border border-border bg-card px-3 py-1.5 text-xs font-medium",
                          "text-foreground shadow-sm transition hover:bg-muted sm:min-h-0"
                        ].join(" ")}
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
                              title="Edit the recurring rent amount used for future payments."
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

                  {isActivityOpen && onCreateTenantActivity && onGetTenantActivityLog ? (
                    <div className="pl-0 sm:pl-6">
                      <TenantActivityTimeline
                        tenantProfileId={lease.tenantProfileId}
                        propertyId={lease.propertyId}
                        unitId={lease.unitId}
                        leaseId={lease.id}
                        tenantName={lease.tenantName}
                        onLoadEntries={onGetTenantActivityLog}
                        onCreateActivity={onCreateTenantActivity}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
            </AnimatedList>
            <LeaseListPreviewControl
              hasMore={hasMore}
              expanded={expanded}
              setExpanded={setExpanded}
              leaseCount={leases.length}
            />

            <LeaseRentHistory rentIncreaseHistory={rentIncreaseHistory} />
          </div>
        )}
      </CardContent>
      <LeaseModals
        confirmDeleteLeaseId={confirmDeleteLeaseId}
        setConfirmDeleteLeaseId={setConfirmDeleteLeaseId}
        deleteFormRefs={deleteFormRefs}
        editingLease={editingLease}
        setEditingLease={setEditingLease}
        editingTenant={editingTenant}
        setEditingTenant={setEditingTenant}
        messagingTenant={messagingTenant}
        setMessagingTenant={setMessagingTenant}
        onUpdateLease={onUpdateLease}
        onUpdateTenantDisplayInfo={onUpdateTenantDisplayInfo}
        onSendMessageToTenant={onSendMessageToTenant}
      />
    </Card>
  );
}
