"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BatchToolbar } from "@/components/dashboard/batch-toolbar";
import { AutopayCard } from "./autopay-card";
import { AnimatedList } from "@/components/ui/animated-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChargeEditModal } from "./charge-edit-modal";
import { ChargeCreateForm } from "./charge-create-form";
import { ComposeMessageModal } from "./compose-message-modal";
import { ChargeRow, getChargeLabel, type ChargeRowData } from "./charge-row";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";
import {
  ChargeSectionFilters,
  ChargeSectionHeader,
  type ChargeFilter
} from "./charge-section-controls";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Charge = ChargeRowData;

interface ChargeLeaseOption {
  id: string;
  tenantLabel: string;
  propertyLabel: string;
}

interface AutopayEnrollmentView {
  id: string;
  leaseId: string;
  propertyLabel: string;
  last4: string;
  brand: string | null;
  paymentMethodType: string;
  enabled: boolean;
  retryCount: number;
}

interface ChargesSectionProps {
  charges: Charge[];
  onPayCharge: (formData: FormData) => Promise<void>;
  onPayWithACH?: (formData: FormData) => Promise<void>;
  onDeletePendingCharge?: StatefulAction;
  onEditCharge?: StatefulAction;
  onCreateManualCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onRecordManualPayment?: StatefulAction;
  onSendMessageToTenant?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onGenerateChargesHref?: string;
  showManualPayment?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  stripeConnected?: boolean;
  isTenantView?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
  onDisableAutopay?: StatefulAction;
  tenantPayState?: "can_pay" | "not_ready" | "outside" | "paid" | "not_posted";
  previewCount?: number;
  availableLeases?: ChargeLeaseOption[];
  /** @deprecated Use simpleRentView. Kept for existing owner component tests. */
  isOwnerView?: boolean;
  simpleRentView?: boolean;
  showBankConnectionNotice?: boolean;
  bankConnected?: boolean;
  hideTenantPaymentControls?: boolean;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "This action is unavailable."
});

function InlineAlert({ state, defaultMessage }: { state: ActionState; defaultMessage: string }) {
  if (!state) return null;
  if (state.success) {
    return (
      <Alert variant="success" className="mb-3">
        {state.message ?? defaultMessage}
      </Alert>
    );
  }

  return (
    <Alert variant="error" className="mb-3">
      {state.error}
    </Alert>
  );
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function exportChargesCsv(charges: Charge[]) {
  const rows = [
    ["Tenant", "Property", "Unit", "Amount", "Due Date", "Status"],
    ...charges.map((charge) => [
      charge.tenantName ?? "",
      charge.propertyName ?? "",
      charge.unitNumber ?? "",
      formatCurrency(charge.amountCents),
      charge.dueDate,
      charge.status
    ])
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `charges-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ChargesSection({
  charges,
  onPayCharge,
  onPayWithACH,
  onDeletePendingCharge,
  onEditCharge,
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
  const router = useRouter();
  const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const searchParams = useSearchParams();
  const lateCount = charges.filter(
    (charge) => charge.status === "late" && !isCollectedOutsideDomus(charge)
  ).length;
  const pendingCount = charges.filter((charge) => charge.status === "pending").length;
  const [activeFilter, setActiveFilter] = useState<ChargeFilter>(
    simpleRentView ? (lateCount > 0 ? "late" : "due_soon") : "all"
  );
  const [manualPaymentChargeId, setManualPaymentChargeId] = useState<string | null>(null);
  const [activeEditChargeId, setActiveEditChargeId] = useState<string | null>(null);
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
  const batchActionsEnabled = Boolean(onSendBatchPaymentReminder) && !isTenantView && !simpleRentView;

  useEffect(() => {
    if (manualPaymentState?.success) {
      setManualPaymentChargeId(null);
    }
  }, [manualPaymentState]);

  const filteredCharges = useMemo(
    () => charges.filter((charge) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "due_soon") return charge.status === "pending";
      if (activeFilter === "late") {
        return charge.status === "late" && !isCollectedOutsideDomus(charge);
      }
      return charge.status === activeFilter;
    }),
    [activeFilter, charges]
  );
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
    const dueDate = new Date(`${charge.dueDate}T00:00:00.000Z`);
    const now = new Date();
    return dueDate.getUTCMonth() === now.getUTCMonth() && dueDate.getUTCFullYear() === now.getUTCFullYear();
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

  const handleSendReminder = () => {
    if (!onSendBatchPaymentReminder || selectedChargeIds.size === 0) {
      return;
    }

    startSendingReminders(async () => {
      const formData = new FormData();
      for (const chargeId of selectedChargeIds) {
        formData.append("chargeIds", chargeId);
      }

      const result = await onSendBatchPaymentReminder(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to send reminders right now.");
        return;
      }

      toast.success(result.message ?? "Payment reminders sent.");
      setSelectedChargeIds(new Set());
      router.refresh();
    });
  };

  const handleSingleReminder = (chargeId: string) => {
    if (!onSendBatchPaymentReminder) return;
    startSendingReminders(async () => {
      const formData = new FormData();
      formData.append("chargeIds", chargeId);
      const result = await onSendBatchPaymentReminder(null, formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to send this reminder.");
        return;
      }
      toast.success(result.message ?? "Reminder sent.");
      router.refresh();
    });
  };

  const openFirstManualPayment = () => {
    const charge = charges.find(
      (item) => item.status === "late" && !isCollectedOutsideDomus(item)
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
        toast.error(result?.error ?? "Unable to delete this charge.");
        return;
      }
      toast.success(result.message ?? "Charge deleted.");
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
        toast.error(result?.error ?? "Unable to waive this charge.");
        return;
      }
      toast.success(result.message ?? "Charge waived.");
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
      />
      <CardContent>
        {simpleRentView ? (
          <p className="mb-4 text-sm text-[var(--muted)]">Rent is added each month from your leases.</p>
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

        {!isTenantView ? <ChargeSectionFilters simpleRentView={simpleRentView} activeFilter={activeFilter} pendingCount={pendingCount} lateCount={lateCount} paidThisMonthCount={paidThisMonthCount} onChange={setActiveFilter} /> : null}

        {showManualPayment ? (
          <InlineAlert state={manualPaymentState} defaultMessage="Payment recorded." />
        ) : null}

        {batchActionsEnabled ? (
          <>
            <BatchToolbar
              selectedCount={selectedChargeIds.size}
              onDeselectAll={() => setSelectedChargeIds(new Set())}
              onSendReminder={handleSendReminder}
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
                  aria-label="Select all visible charges"
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
          <EmptyState
            icon={CreditCard}
            title={charges.length === 0 ? (isTenantView ? "No rent posted yet" : "No rent yet") : (isTenantView ? "No matching rent" : "No matching rent")}
            description={
              charges.length === 0
                ? isTenantView
                  ? "No rent posted yet. Rent is added each month from your lease."
                  : "Rent will appear here after you create a lease."
                : isTenantView ? "No rent matches this view right now." : "No rent matches this filter right now."
            }
          />
        ) : (
          <>
            <AnimatedList>
              {visibleCharges.map((charge, index) => {
                const manualFormOpen = manualPaymentChargeId === charge.id;
                const ownerConnected = ownerConnectedMap?.get(charge.propertyId) ?? stripeConnected ?? true;
                const paymentsAvailable = !hideTenantPaymentControls && stripeConfigured && ownerConnected;
                const category = charge.category ?? "rent";
                const canModify = !isTenantView && (charge.status === "pending" || charge.status === "late");

                return (
                  <ChargeRow
                    key={charge.id}
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
                    onWaive={
                      canModify && onWaiveCharge ? () => handleWaiveCharge(charge.id) : undefined
                    }
                    onDelete={
                      canModify && onDeletePendingCharge
                        ? () => setConfirmDeleteChargeId(charge.id)
                        : undefined
                    }
                    onOpenMessage={
                      onSendMessageToTenant && charge.tenantProfileId && charge.tenantName
                        ? () => setActiveMessageChargeId(charge.id)
                        : undefined
                    }
                    onSendReminder={
                      simpleRentView && onSendBatchPaymentReminder
                        ? () => handleSingleReminder(charge.id)
                        : undefined
                    }
                    simpleView={simpleRentView}
                    isMutatingCharges={isMutatingCharges}
                  />
                );
              })}
            </AnimatedList>

            {hasMoreVisibleCharges ? (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? "Collapse the charges preview." : "Show the full charges list."}
                >
                  {expanded ? "Show less" : `View all rent (${filteredCharges.length})`}
                </Button>
              </div>
            ) : null}
          </>
        )}

        <ConfirmDialog
          title="Delete Charge?"
          description={
            chargePendingDeletion
              ? `Delete this ${chargePendingDeletion.status} charge of ${formatCurrency(chargePendingDeletion.amountCents)} due on ${formatDate(chargePendingDeletion.dueDate)}? This cannot be undone.`
              : "Delete this charge? This cannot be undone."
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
            prefilledSubject={`Charge update for ${activeMessageCharge.propertyName ?? "your rental"}`}
            onSend={onSendMessageToTenant}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
