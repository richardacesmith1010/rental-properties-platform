"use client";

import { denverMonth } from "@/lib/denver-calendar";
import { useDenverDayRefresh } from "@/components/dashboard/use-denver-day-refresh";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BatchToolbar } from "@/components/dashboard/batch-toolbar";
import { AutopayCard } from "../autopay-card";
import { AnimatedList } from "@/components/ui/animated-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChargeEditModal } from "../charge-edit-modal";
import { ChargeCreateForm } from "../charge-create-form";
import { ComposeMessageModal } from "../compose-message-modal";
import { ChargeRow, getChargeLabel } from "../charge-row";
import { NextBillLineSheet } from "../next-bill-line-sheet";
import { tracksLateRent } from "@/lib/lease-collection";
import { isRentOpenForTenant } from "@/lib/rent-urgency";
import {
  ChargeSectionFilters,
  ChargeSectionHeader,
  RentEmptyState,
  type ChargeFilter
} from "../charge-section-controls";
import { InlineAlert, exportChargesCsv, unavailableAction } from "./helpers";
import type { ChargesSectionProps } from "./types";

export function ChargesSection({
  charges,
  todayIso,
  onPayCharge,
  onPayWithACH,
  onDeletePendingCharge,
  onEditCharge,
  onAddNextBillLine,
  onRemoveNextBillLine,
  onCreateManualCharge,
  onWaiveCharge,
  onRecordManualPayment,
  onSendMessageToTenant,
  onSendBatchPaymentReminder,
  onGenerateChargesHref,
  showManualPayment = false,
  ownerConnectedMap,
  stripeConnected,
  isTenantView = false,
  autopayEnrollments = [],
  onSetupAutopay,
  onDisableAutopay,
  tenantPayState,
  previewCount,
  availableLeases = [],
  isOwnerView = false,
  simpleRentView: simpleRentViewProp,
  showBankConnectionNotice,
  bankConnected = true,
  hideTenantPaymentControls = false
}: ChargesSectionProps) {
  const simpleRentView = simpleRentViewProp ?? isOwnerView;
  const month = denverMonth();
  const chargedLeaseIds = new Set(charges.filter((charge) =>
    (charge.category ?? "rent") === "rent" && charge.dueDate.startsWith(month))
    .map((charge) => charge.leaseId));
  const showAddRentNow = availableLeases.some((lease) => !chargedLeaseIds.has(lease.id));
  const router = useRouter();
  const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const searchParams = useSearchParams();
  const lateCount = charges.filter(
    (charge) => charge.status === "late" && tracksLateRent(charge)
  ).length;
  useDenverDayRefresh(todayIso);
  const pendingCount = charges.filter((charge) => charge.status === "pending").length;
  const dueSoonCount = charges.filter((c) => c.status === "pending" && isRentOpenForTenant(c.dueDate, todayIso)).length;
  const filterPendingCount = simpleRentView ? dueSoonCount : pendingCount;
  const [activeFilter, setActiveFilter] = useState<ChargeFilter>(
    simpleRentView ? (lateCount > 0 ? "late" : "due_soon") : "all"
  );
  const [manualPaymentChargeId, setManualPaymentChargeId] = useState<string | null>(null);
  const [activeEditChargeId, setActiveEditChargeId] = useState<string | null>(null);
  const [nextBillLeaseId, setNextBillLeaseId] = useState<string | null>(null);
  const [showCreateChargeForm, setShowCreateChargeForm] = useState(false);
  const [confirmDeleteChargeId, setConfirmDeleteChargeId] = useState<string | null>(null);
  const [activeMessageChargeId, setActiveMessageChargeId] = useState<string | null>(null);
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [isSendingReminders, startSendingReminders] = useTransition();
  const [isMutatingCharges, startChargeMutation] = useTransition();
  const [manualPaymentState, recordManualPaymentAction] = useFormState(
    onRecordManualPayment ?? unavailableAction,
    null
  );
  const [dismissedManualPaymentState, setDismissedManualPaymentState] = useState<typeof manualPaymentState>(null);
  const managerView = charges.some((charge) => "managerReminderAllowed" in charge);
  const reminderAllowed = (charge: ChargesSectionProps["charges"][number]) =>
    !managerView || (charge as typeof charge & { managerReminderAllowed?: boolean }).managerReminderAllowed === true;
  const batchActionsEnabled = Boolean(onSendBatchPaymentReminder) && !isTenantView && (!simpleRentView || managerView);
  useEffect(() => {
    if (manualPaymentState?.success) {
      setManualPaymentChargeId(null);
    }
  }, [manualPaymentState]);
  const filteredCharges = charges.filter((charge) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "due_soon") return charge.status === "pending" &&
        isRentOpenForTenant(charge.dueDate, todayIso);
      if (activeFilter === "late") {
        return charge.status === "late" && tracksLateRent(charge);
      }
      return charge.status === activeFilter;
    });
  const visibleCharges = previewCount && !expanded ? filteredCharges.slice(0, previewCount) : filteredCharges;
  const hasMoreVisibleCharges = previewCount != null && filteredCharges.length > previewCount;
  useEffect(() => {
    if (!batchActionsEnabled) {
      setSelectedChargeIds((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    setSelectedChargeIds((current) => {
      const visibleIds = new Set(visibleCharges.map((charge) => charge.id));
      const next = new Set(Array.from(current).filter((chargeId) => visibleIds.has(chargeId)));
      return next.size === current.size ? current : next;
    });
  }, [batchActionsEnabled, visibleCharges]);
  const paidThisMonthCount = charges.filter((charge) => {
    if (charge.status !== "paid") return false;
    return charge.dueDate.slice(0, 7) === month;
  }).length;
  const uniqueLeaseCards = useMemo(() => {
    if (!isTenantView) {
      return [] as Array<{ leaseId: string; propertyLabel: string }>;
    }
    const cards = new Map<string, string>();
    for (const charge of charges) {
      if (!charge.leaseId || cards.has(charge.leaseId)) {
        continue;
      }
      cards.set(charge.leaseId, getChargeLabel(charge));
    }
    return Array.from(cards.entries()).map(([leaseId, propertyLabel]) => ({
      leaseId,
      propertyLabel
    }));
  }, [charges, isTenantView]);
  const autopayStatus = searchParams?.get("autopay") ?? null;
  const selectedVisibleCharges = visibleCharges.filter((charge) => selectedChargeIds.has(charge.id));
  const selectionCanRemind = selectedVisibleCharges.every(reminderAllowed);
  const allVisibleSelected =
    visibleCharges.length > 0 && visibleCharges.every((charge) => selectedChargeIds.has(charge.id));
  const chargePendingDeletion = confirmDeleteChargeId
    ? charges.find((charge) => charge.id === confirmDeleteChargeId) ?? null
    : null;
  const activeEditCharge = activeEditChargeId
    ? (() => {
        const charge = charges.find((item) => item.id === activeEditChargeId) ?? null;
        return charge
          ? {
              ...charge,
              category: charge.category ?? "rent"
            }
          : null;
      })()
    : null;
  const activeMessageCharge = activeMessageChargeId
    ? charges.find((charge) => charge.id === activeMessageChargeId) ?? null
    : null;
  const toggleChargeSelection = (chargeId: string, checked: boolean) => {
    setSelectedChargeIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(chargeId);
      } else {
        next.delete(chargeId);
      }
      return next;
    });
  };
  const toggleAllVisibleCharges = (checked: boolean) => {
    setSelectedChargeIds((current) => {
      const next = new Set(current);
      for (const charge of visibleCharges) {
        if (checked) {
          next.add(charge.id);
        } else {
          next.delete(charge.id);
        }
      }
      return next;
    });
  };
  const sendReminders = (chargeIds: string[], single: boolean) => {
    if (!onSendBatchPaymentReminder || chargeIds.length === 0 || (!single && !selectionCanRemind)) return;
    startSendingReminders(async () => {
      const formData = new FormData();
      chargeIds.forEach((chargeId) => formData.append("chargeIds", chargeId));
      const result = await onSendBatchPaymentReminder(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? (single ? "Unable to send this reminder." : "Unable to send reminders right now."));
        return;
      }
      toast.success(result.message ?? (single ? "Reminder sent." : "Payment reminders sent."));
      if (!single) setSelectedChargeIds(new Set());
      router.refresh();
    });
  };
  const handleSendReminder = () => sendReminders(Array.from(selectedChargeIds), false);
  const handleSingleReminder = (chargeId: string) => sendReminders([chargeId], true);
  const openFirstManualPayment = () => {
    const charge = charges.find(
      (item) => item.status === "late" && tracksLateRent(item)
    ) ?? charges.find((item) => item.status === "pending");
    if (!charge) return;
    setActiveFilter(charge.status === "late" ? "late" : "due_soon");
    setManualPaymentChargeId(charge.id);
    window.setTimeout(() => {
      document.getElementById(`charge-${charge.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };
  const handleDeleteCharge = () => {
    if (!confirmDeleteChargeId || !onDeletePendingCharge) {
      return;
    }
    startChargeMutation(async () => {
      const formData = new FormData();
      formData.set("chargeId", confirmDeleteChargeId);
      formData.set("reason", "Deleted from charges dashboard");
      const result = await onDeletePendingCharge(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to delete this payment.");
        return;
      }
      toast.success(result.message ?? "Payment deleted.");
      setConfirmDeleteChargeId(null);
      router.refresh();
    });
  };
  const handleWaiveCharge = (chargeId: string) => {
    if (!onWaiveCharge) {
      return;
    }
    startChargeMutation(async () => {
      const formData = new FormData();
      formData.set("chargeId", chargeId);
      formData.set("reason", "Waived from charges dashboard");
      const result = await onWaiveCharge(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to waive this payment.");
        return;
      }
      toast.success(result.message ?? "Payment waived.");
      router.refresh();
    });
  };
  return (
    <Card id="charges" className="border border-border/50 shadow-sm">
      <ChargeSectionHeader
        isTenantView={isTenantView}
        simpleRentView={simpleRentView}
        showManualPayment={showManualPayment}
        unpaidCount={lateCount + pendingCount}
        canCreateCharge={Boolean(onCreateManualCharge && availableLeases.length > 0 && !isTenantView)}
        onOpenManualPayment={openFirstManualPayment}
        onOpenCreateCharge={() => setShowCreateChargeForm(true)}
        onGenerateChargesHref={onGenerateChargesHref}
        showAddRentNow={showAddRentNow && filteredCharges.length > 0}
      />
      <CardContent>
        {simpleRentView ? (
          <p className="mb-4 text-sm text-[var(--muted)]">Rent is added each month for every lease.</p>
        ) : null}
        {(showBankConnectionNotice ?? isOwnerView) && !bankConnected ? (
          <p className="mb-4 text-sm text-[var(--muted)]">
            Tenants can’t pay online until your bank is connected.{" "}
            <a href="/owner" className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline" title="Open Home to connect your bank.">Connect bank</a>
          </p>
        ) : null}
        {isTenantView && autopayStatus === "enrolled" ? (
          <Alert variant="success" className="mb-4 px-4 py-3">
            Autopay enabled. Your rent will be charged automatically on the due date.
          </Alert>
        ) : null}
        {isTenantView && autopayStatus === "error" ? (
          <Alert variant="error" className="mb-4 px-4 py-3">
            We couldn&apos;t finish your autopay setup. Please try again.
          </Alert>
        ) : null}
        {!stripeConfigured ? (
          <Alert variant="warning" className="mb-4 px-4 py-3">
            Payment processing is temporarily unavailable. Please try again later.
          </Alert>
        ) : null}
        {isTenantView && (tenantPayState === undefined || tenantPayState === "can_pay") && uniqueLeaseCards.length > 0 ? (
          <AnimatedList className="mb-4 space-y-3">
            {uniqueLeaseCards.map(({ leaseId, propertyLabel }) => {
              const enrollment = autopayEnrollments.find((item) => item.leaseId === leaseId) ?? null;
              return (
                <AutopayCard
                  key={leaseId}
                  leaseId={leaseId}
                  propertyLabel={enrollment?.propertyLabel ?? propertyLabel}
                  enrollment={enrollment}
                  onSetupAutopay={onSetupAutopay ?? unavailableAction}
                  onDisableAutopay={onDisableAutopay ?? unavailableAction}
                />
              );
            })}
          </AnimatedList>
        ) : null}
        {!isTenantView ? <ChargeSectionFilters simpleRentView={simpleRentView} activeFilter={activeFilter}
          pendingCount={filterPendingCount} lateCount={lateCount} paidThisMonthCount={paidThisMonthCount}
          onChange={setActiveFilter} /> : null}
        {showManualPayment ? (
          <InlineAlert state={manualPaymentState === dismissedManualPaymentState ? null : manualPaymentState}
            defaultMessage="Payment recorded." />
        ) : null}
        {batchActionsEnabled ? (
          <>
            <BatchToolbar
              selectedCount={selectedChargeIds.size}
              onDeselectAll={() => setSelectedChargeIds(new Set())}
              onSendReminder={handleSendReminder}
              reminderDisabled={managerView && !selectionCanRemind}
              reminderDisabledReason={managerView && !selectionCanRemind
                ? "Some homes can't get reminders yet." : undefined}
              onExport={() => exportChargesCsv(selectedVisibleCharges)}
              sendingReminders={isSendingReminders}
            />
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border/50 bg-background px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisibleCharges(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  aria-label="Select all visible payments"
                />
                Select all visible
              </label>
              <span className="text-xs text-[var(--muted)]">
                {selectedVisibleCharges.length} of {visibleCharges.length} visible selected
              </span>
            </div>
          </>
        ) : null}
        {filteredCharges.length === 0 ? (
          <RentEmptyState isTenantView={isTenantView} hasRows={charges.length > 0}
            hasActiveLeases={availableLeases.length > 0} hasCurrentMonthRent={chargedLeaseIds.size > 0}
            generateHref={onGenerateChargesHref} />
        ) : (
          <>
            <div>
              {visibleCharges.map((charge, index) => {
                const manualFormOpen = manualPaymentChargeId === charge.id;
                const ownerConnected = ownerConnectedMap?.get(charge.propertyId) ?? stripeConnected ?? true;
                const paymentsAvailable = !hideTenantPaymentControls && stripeConfigured && ownerConnected;
                const category = charge.category ?? "rent";
                const canModify = !isTenantView && (charge.status === "pending" || charge.status === "late");
                return (
                  <ChargeRow
                    key={charge.id}
                    todayIso={todayIso}
                    charge={charge}
                    last={index === visibleCharges.length - 1}
                    batchActionsEnabled={batchActionsEnabled}
                    selected={selectedChargeIds.has(charge.id)}
                    onToggleSelection={(checked) => toggleChargeSelection(charge.id, checked)}
                    canModify={canModify}
                    category={category}
                    isTenantView={isTenantView}
                    paymentsAvailable={paymentsAvailable}
                    tenantPayState={tenantPayState}
                    stripeConfigured={stripeConfigured}
                    onPayCharge={onPayCharge}
                    onPayWithACH={onPayWithACH}
                    showManualPayment={showManualPayment}
                    manualFormOpen={manualFormOpen}
                    manualPaymentAction={recordManualPaymentAction}
                    onToggleManualPayment={() =>
                      setManualPaymentChargeId((current) => (current === charge.id ? null : charge.id))
                    }
                    onOpenEdit={
                      canModify && onEditCharge ? () => setActiveEditChargeId(charge.id) : undefined
                    }
                    onAddNextBill={onAddNextBillLine && charge.leaseId && !isTenantView
                      ? () => setNextBillLeaseId(charge.leaseId!) : undefined}
                    onRemoveNextBillLine={onRemoveNextBillLine ? (lineId) => {
                      void onRemoveNextBillLine(lineId).then((result) => {
                        if (!result.ok) toast.error(result.error ?? "Could not remove this line.");
                        else router.refresh();
                      });
                    } : undefined}
                    onWaive={
                      canModify && onWaiveCharge ? () => handleWaiveCharge(charge.id) : undefined
                    }
                    onDelete={
                      canModify && onDeletePendingCharge
                        ? () => setConfirmDeleteChargeId(charge.id)
                        : undefined
                    }
                    onUndoPayment={charge.status === "paid" && !isTenantView && onRecordManualPayment
                      ? async (previous, data) => {
                          const result = await onRecordManualPayment(previous, data);
                          if (result?.success) setDismissedManualPaymentState(manualPaymentState);
                          return result;
                        } : undefined}
                    onOpenMessage={
                      onSendMessageToTenant && charge.tenantProfileId && charge.tenantName
                        ? () => setActiveMessageChargeId(charge.id)
                        : undefined
                    }
                    onSendReminder={
                      simpleRentView && onSendBatchPaymentReminder && reminderAllowed(charge)
                        ? () => handleSingleReminder(charge.id)
                        : undefined
                    }
                    simpleView={simpleRentView}
                    isMutatingCharges={isMutatingCharges}
                  />
                );
              })}
            </div>
            {hasMoreVisibleCharges ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? "Collapse the payments preview." : "Show all payments."}
                >
                  {expanded ? "Show less" : `View all rent (${filteredCharges.length})`}
                </Button>
              </div>
            ) : null}
          </>
        )}
        <ConfirmDialog
          title="Delete Payment?"
          description={
            chargePendingDeletion
              ? `Delete this ${chargePendingDeletion.status} payment of ${formatCurrency(chargePendingDeletion.amountCents)} ` +
                `due on ${formatDate(chargePendingDeletion.dueDate)}? This cannot be undone.`
              : "Delete this payment? This cannot be undone."
          }
          confirmLabel="Delete Charge"
          open={Boolean(confirmDeleteChargeId)}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmDeleteChargeId(null);
            }
          }}
          onConfirm={handleDeleteCharge}
        />
        {onEditCharge ? (
          <ChargeEditModal
            charge={activeEditCharge}
            open={Boolean(activeEditCharge)}
            onClose={() => setActiveEditChargeId(null)}
            onSave={onEditCharge}
          />
        ) : null}
        {nextBillLeaseId && onAddNextBillLine ? <NextBillLineSheet leaseId={nextBillLeaseId}
          onAdd={async (input) => {
            const result = await onAddNextBillLine(input);
            if (result.ok) router.refresh();
            return result;
          }} onClose={() => setNextBillLeaseId(null)} /> : null}
        {onCreateManualCharge ? (
          <ChargeCreateForm
            open={showCreateChargeForm}
            leases={availableLeases}
            onSubmit={onCreateManualCharge}
            onCancel={() => setShowCreateChargeForm(false)}
          />
        ) : null}
        {onSendMessageToTenant &&
        activeMessageCharge &&
        activeMessageCharge.tenantProfileId &&
        activeMessageCharge.tenantName ? (
          <ComposeMessageModal
            open={Boolean(activeMessageCharge)}
            onClose={() => setActiveMessageChargeId(null)}
            recipientName={activeMessageCharge.tenantName}
            recipientProfileId={activeMessageCharge.tenantProfileId}
            propertyId={activeMessageCharge.propertyId}
            propertyName={`${activeMessageCharge.propertyName ?? "Property"} · ${activeMessageCharge.unitNumber ?? "Unit"}`}
            prefilledSubject={`Payment update for ${activeMessageCharge.propertyName ?? "your rental"}`}
            onSend={onSendMessageToTenant}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
