"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleOff, CreditCard, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BatchToolbar } from "@/components/dashboard/batch-toolbar";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { AutopayCard } from "./autopay-card";
import { AnimatedList } from "@/components/ui/animated-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChargeEditModal } from "./charge-edit-modal";
import { ChargeCreateForm } from "./charge-create-form";
import { chargeCategoryLabel, type ChargeCategory } from "@/lib/charge-audit";

type ChargeStatus = "pending" | "paid" | "late" | "waived";
type ChargeFilter = "all" | ChargeStatus;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface Charge {
  id: string;
  leaseId?: string;
  propertyId: string;
  dueDate: string;
  amountCents: number;
  status: ChargeStatus;
  propertyName?: string;
  propertyLabel?: string;
  unitNumber?: string;
  tenantName?: string;
  category?: ChargeCategory;
  notes?: string | null;
  reminderSentAt?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
}

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
  onDeletePendingCharge?: StatefulAction;
  onEditCharge?: StatefulAction;
  onCreateManualCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onRecordManualPayment?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onGenerateChargesHref?: string;
  showManualPayment?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  stripeConnected?: boolean;
  isTenantView?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
  onDisableAutopay?: StatefulAction;
  previewCount?: number;
  availableLeases?: ChargeLeaseOption[];
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

function getChargeLabel(charge: Charge) {
  if (charge.propertyLabel) {
    return charge.propertyLabel;
  }

  const propertyName = charge.propertyName ?? "Unknown Property";
  const unitNumber = charge.unitNumber ?? "-";
  return `${propertyName} • Unit ${unitNumber}`;
}

function statusLabel(status: ChargeStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
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
  onDeletePendingCharge,
  onEditCharge,
  onCreateManualCharge,
  onWaiveCharge,
  onRecordManualPayment,
  onSendBatchPaymentReminder,
  onGenerateChargesHref,
  showManualPayment = false,
  ownerConnectedMap,
  stripeConnected,
  isTenantView = false,
  autopayEnrollments = [],
  onSetupAutopay,
  onDisableAutopay,
  previewCount,
  availableLeases = []
}: ChargesSectionProps) {
  const router = useRouter();
  const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<ChargeFilter>("all");
  const [manualPaymentChargeId, setManualPaymentChargeId] = useState<string | null>(null);
  const [activeEditChargeId, setActiveEditChargeId] = useState<string | null>(null);
  const [showCreateChargeForm, setShowCreateChargeForm] = useState(false);
  const [confirmDeleteChargeId, setConfirmDeleteChargeId] = useState<string | null>(null);
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [isSendingReminders, startSendingReminders] = useTransition();
  const [isMutatingCharges, startChargeMutation] = useTransition();
  const [manualPaymentState, recordManualPaymentAction] = useFormState(
    onRecordManualPayment ?? unavailableAction,
    null
  );
  const batchActionsEnabled = Boolean(onSendBatchPaymentReminder) && !isTenantView;

  useEffect(() => {
    if (manualPaymentState?.success) {
      setManualPaymentChargeId(null);
    }
  }, [manualPaymentState]);

  const filteredCharges = useMemo(
    () => charges.filter((charge) => activeFilter === "all" || charge.status === activeFilter),
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

  const pendingCount = charges.filter((charge) => charge.status === "pending").length;
  const lateCount = charges.filter((charge) => charge.status === "late").length;
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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-xl font-semibold">
          {isTenantView ? "Rent Payments" : "Upcoming / Late Charges"}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {onCreateManualCharge && availableLeases.length > 0 && !isTenantView ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowCreateChargeForm(true)}
              title="Create a manual one-off charge."
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Charge
            </Button>
          ) : null}
          {onGenerateChargesHref ? (
            <Link
              href={onGenerateChargesHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
              title="Generate rent charges for the current billing period."
            >
              Generate This Month Charges
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
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

        {isTenantView && uniqueLeaseCards.length > 0 ? (
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

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
          <Badge className="border-amber-300 bg-amber-100 px-3 py-1 text-amber-800">
            {pendingCount} pending
          </Badge>
          <Badge className="border-red-300 bg-red-100 px-3 py-1 text-red-800">
            {lateCount} late
          </Badge>
          <Badge className="border-emerald-300 bg-emerald-100 px-3 py-1 text-emerald-800">
            {paidThisMonthCount} paid this month
          </Badge>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["pending", "Pending"],
            ["late", "Late"],
            ["paid", "Paid"],
            ["waived", "Waived"]
          ] as Array<[ChargeFilter, string]>).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant="outline"
              className={
                activeFilter === value
                  ? "border-primary/40 bg-primary/10 font-semibold text-primary shadow-sm"
                  : "font-medium"
              }
              onClick={() => setActiveFilter(value)}
              title={`Show ${label.toLowerCase()} charges.`}
            >
              {label}
            </Button>
          ))}
        </div>

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
            <div className="mb-3 flex items-center justify-between rounded-xl border border-border/50 bg-background px-3 py-2 shadow-sm">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisibleCharges(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  aria-label="Select all visible charges"
                />
                Select all visible
              </label>
              <span className="text-xs text-zinc-600">
                {selectedVisibleCharges.length} of {visibleCharges.length} visible selected
              </span>
            </div>
          </>
        ) : null}

        {filteredCharges.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={charges.length === 0 ? "No charges yet" : "No matching charges"}
            description={
              charges.length === 0
                ? isTenantView
                  ? "No charges yet. Charges are generated automatically on the 1st of each month."
                  : "Charges will appear here once you create a lease with rent terms."
                : "No charges match this filter right now."
            }
          />
        ) : (
          <>
            <AnimatedList>
              {visibleCharges.map((charge, index) => {
                const manualFormOpen = manualPaymentChargeId === charge.id;
                const ownerConnected = ownerConnectedMap?.get(charge.propertyId) ?? stripeConnected ?? true;
                const paymentsAvailable = stripeConfigured && ownerConnected;
                const category = charge.category ?? "rent";
                const canModify = !isTenantView && (charge.status === "pending" || charge.status === "late");

                return (
                  <DataRow key={charge.id} last={index === visibleCharges.length - 1}>
                    {batchActionsEnabled ? (
                      <div className="flex items-start pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedChargeIds.has(charge.id)}
                          onChange={(event) => toggleChargeSelection(charge.id, event.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                          aria-label={`Select charge for ${getChargeLabel(charge)}`}
                          title={`Select ${getChargeLabel(charge)}.`}
                        />
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-foreground">{getChargeLabel(charge)}</p>
                      {!isTenantView && charge.tenantName ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{charge.tenantName}</p>
                      ) : null}
                      <p className="mt-0.5 text-sm text-muted-foreground">Due {formatDate(charge.dueDate)}</p>
                      {charge.notes ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{charge.notes}</p>
                      ) : null}
                      {!isTenantView && charge.reminderSentAt ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" aria-hidden="true" />
                          Reminder sent {formatDate(charge.reminderSentAt)}
                        </p>
                      ) : null}
                      {!isTenantView && charge.editedCount ? (
                        <p
                          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                          title={
                            charge.latestEditedAt && charge.latestEditedByName
                              ? `Last edited by ${charge.latestEditedByName} on ${formatDate(charge.latestEditedAt)}`
                              : "Charge has been edited."
                          }
                        >
                          Edited {charge.editedCount}x
                        </p>
                      ) : null}

                      {showManualPayment && manualFormOpen && charge.status !== "paid" && charge.status !== "waived" ? (
                        <form action={recordManualPaymentAction} className="mt-3 grid gap-3 sm:grid-cols-4">
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-zinc-600" htmlFor={`manual-payment-amount-${charge.id}`}>
                              Amount
                            </label>
                            <Input
                              id={`manual-payment-amount-${charge.id}`}
                              name="amountDollars"
                              type="number"
                              min={0.01}
                              step="0.01"
                              defaultValue={(charge.amountCents / 100).toFixed(2)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-zinc-600" htmlFor={`manual-payment-method-${charge.id}`}>
                              Method
                            </label>
                            <select
                              id={`manual-payment-method-${charge.id}`}
                              name="method"
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                              defaultValue="cash"
                              title="Select manual payment method."
                            >
                              <option value="cash">Cash</option>
                              <option value="check">Check</option>
                              <option value="ach">ACH</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-zinc-600" htmlFor={`manual-payment-reference-${charge.id}`}>
                              Reference Note
                            </label>
                            <Input id={`manual-payment-reference-${charge.id}`} name="referenceNote" placeholder="Optional" />
                          </div>
                          <div>
                            <SubmitButton size="sm" variant="outline" title="Record this manual payment.">
                              Save Payment
                            </SubmitButton>
                          </div>
                        </form>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-base font-medium text-foreground">{formatCurrency(charge.amountCents)}</p>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span
                            className={statusBadgeClasses(charge.status)}
                            aria-label={statusAriaLabel(charge.status, "Charge status")}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(charge.status).dot}`}
                            />
                            {statusLabel(charge.status)}
                          </span>
                          {category !== "rent" ? (
                            <Badge variant="outline">{chargeCategoryLabel(category)}</Badge>
                          ) : null}
                        </div>
                      </div>

                      {charge.status !== "paid" && charge.status !== "waived" ? (
                        paymentsAvailable ? (
                          <form action={onPayCharge}>
                            <input type="hidden" name="chargeId" value={charge.id} />
                            <SubmitButton
                              size="sm"
                              title={isTenantView ? "Open secure checkout to pay this charge." : "Open secure checkout for this charge."}
                            >
                              {isTenantView ? "Pay with Card" : "Pay now"}
                            </SubmitButton>
                          </form>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            title={
                              stripeConfigured
                                ? "Online payment unavailable - property owner hasn't connected their bank account."
                                : "Online payment unavailable - Stripe is not configured."
                            }
                          >
                            {isTenantView ? "Pay with Card" : "Pay now"}
                          </Button>
                        )
                      ) : null}

                      {showManualPayment && charge.status !== "paid" && charge.status !== "waived" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={manualFormOpen ? "default" : "outline"}
                          onClick={() => setManualPaymentChargeId((current) => (current === charge.id ? null : charge.id))}
                          title="Record a manual payment for this charge."
                        >
                          {manualFormOpen ? "Cancel" : "Record Payment"}
                        </Button>
                      ) : null}

                      {canModify && onEditCharge ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveEditChargeId(charge.id)}
                          title="Edit this charge."
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      ) : null}

                      {canModify && onWaiveCharge ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isMutatingCharges}
                          onClick={() => handleWaiveCharge(charge.id)}
                          title="Waive this charge."
                        >
                          <CircleOff className="mr-2 h-4 w-4" />
                          Waive
                        </Button>
                      ) : null}

                      {canModify && onDeletePendingCharge ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isMutatingCharges}
                          aria-label={`Delete charge for ${getChargeLabel(charge)}`}
                          title={`Delete the ${charge.status} charge for ${getChargeLabel(charge)}.`}
                          onClick={() => setConfirmDeleteChargeId(charge.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </DataRow>
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
                  {expanded ? "Show Less" : `View All Charges (${filteredCharges.length})`}
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
      </CardContent>
    </Card>
  );
}
