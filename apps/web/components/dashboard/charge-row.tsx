"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleOff,
  Mail,
  MessageSquare,
  MoreVertical,
  Pencil,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { cn, formatCurrency, formatDate } from "@/lib/format";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";
import { chargeCategoryLabel, type ChargeCategory } from "@/lib/charge-audit";

export type ChargeStatus = "pending" | "paid" | "late" | "waived";

export interface ChargeRowData {
  id: string;
  leaseId?: string;
  propertyId: string;
  tenantProfileId?: string | null;
  dueDate: string;
  amountCents: number;
  status: ChargeStatus;
  propertyName?: string;
  propertyLabel?: string;
  unitNumber?: string;
  tenantName?: string;
  tenantEmail?: string | null;
  category?: ChargeCategory;
  notes?: string | null;
  reminderSentAt?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
}

interface ChargeRowProps {
  charge: ChargeRowData;
  last: boolean;
  batchActionsEnabled: boolean;
  selected: boolean;
  onToggleSelection: (checked: boolean) => void;
  canModify: boolean;
  category: ChargeCategory;
  isTenantView: boolean;
  paymentsAvailable: boolean;
  stripeConfigured: boolean;
  onPayCharge: (formData: FormData) => Promise<void>;
  showManualPayment: boolean;
  manualFormOpen: boolean;
  manualPaymentAction: (formData: FormData) => void;
  onToggleManualPayment?: () => void;
  onOpenEdit?: () => void;
  onWaive?: () => void;
  onDelete?: () => void;
  onOpenMessage?: () => void;
  isMutatingCharges: boolean;
}

export function getChargeLabel(charge: ChargeRowData) {
  if (charge.propertyLabel) {
    return charge.propertyLabel;
  }

  const propertyName = charge.propertyName ?? "Unknown Property";
  const unitNumber = charge.unitNumber ?? "-";
  return `${propertyName} • ${unitNumber}`;
}

function statusLabel(status: ChargeStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function ChargeMoreMenu({
  disabled = false,
  onEdit,
  onWaive,
  onDelete
}: {
  disabled?: boolean;
  onEdit?: () => void;
  onWaive?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!onEdit && !onWaive && !onDelete) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 px-3 sm:h-8"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title="Open more charge actions."
        aria-label="Open more charge actions"
      >
        <MoreVertical className="h-4 w-4" />
        <span className="ml-1.5">More</span>
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[11rem] overflow-hidden rounded-2xl border border-border bg-background p-1.5 shadow-xl">
          {onEdit ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              title="Edit this charge."
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : null}
          {onWaive ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onWaive();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              title="Waive this charge."
            >
              <CircleOff className="h-4 w-4" />
              Waive
            </button>
          ) : null}
          {onDelete ? (
            <>
              <div className="my-1 h-px bg-border/70" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                title="Delete this charge."
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChargeRow({
  charge,
  last,
  batchActionsEnabled,
  selected,
  onToggleSelection,
  canModify,
  category,
  isTenantView,
  paymentsAvailable,
  stripeConfigured,
  onPayCharge,
  showManualPayment,
  manualFormOpen,
  manualPaymentAction,
  onToggleManualPayment,
  onOpenEdit,
  onWaive,
  onDelete,
  onOpenMessage,
  isMutatingCharges
}: ChargeRowProps) {
  const label = getChargeLabel(charge);
  const cardPayment = calculateCardFee(charge.amountCents);

  return (
    <div
      className={cn(
        "rounded-2xl px-2 py-3 transition-all duration-150 hover:bg-violet-50/60 hover:shadow-sm sm:px-3",
        last ? "" : "border-b border-violet-100/70"
      )}
    >
      <div className="flex gap-3">
        {batchActionsEnabled ? (
          <div className="flex items-start pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => onToggleSelection(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              aria-label={`Select charge for ${label}`}
              title={`Select ${label}.`}
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(charge.amountCents)}</p>
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

              {!isTenantView && charge.tenantName ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{charge.tenantName}</span>
                  {onOpenMessage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-11 min-w-[44px] rounded-full px-3 sm:h-8 sm:rounded-md"
                      onClick={onOpenMessage}
                      title={`Message ${charge.tenantName}`}
                      aria-label={`Message ${charge.tenantName}`}
                    >
                      <MessageSquare className="h-[18px] w-[18px]" />
                      <span className="hidden sm:inline">Message</span>
                    </Button>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span>Due {formatDate(charge.dueDate)}</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Due {formatDate(charge.dueDate)}</p>
              )}

              {charge.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">{charge.notes}</p>
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
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {charge.status !== "paid" && charge.status !== "waived" ? (
                isTenantView ? (
                  <div className="w-full space-y-2 xl:w-[18rem]">
                    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                      <p className="text-sm font-semibold text-foreground">
                        Pay with debit or credit card
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Includes {formatCentsAsDollars(cardPayment.feeCents)} processing fee
                      </p>
                      {paymentsAvailable ? (
                        <form action={onPayCharge} className="mt-3">
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <SubmitButton
                            size="sm"
                            className="h-11 w-full"
                            title={`Pay ${formatCentsAsDollars(cardPayment.totalCents)} with debit or credit card.`}
                          >
                            Pay {formatCentsAsDollars(cardPayment.totalCents)}
                          </SubmitButton>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3 h-11 w-full"
                          disabled
                          title={
                            stripeConfigured
                              ? "Online payment is not ready for this property yet."
                              : "Online payment is not available right now."
                          }
                        >
                          Pay {formatCentsAsDollars(cardPayment.totalCents)}
                        </Button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-background/80 p-3 opacity-80">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Pay from bank account</p>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          Free
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Coming soon — no extra fees
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3 h-11 w-full"
                        disabled
                        title="Bank account payments are coming soon."
                      >
                        Coming Soon
                      </Button>
                    </div>
                  </div>
                ) : (
                  paymentsAvailable ? (
                    <form action={onPayCharge}>
                      <input type="hidden" name="chargeId" value={charge.id} />
                      <SubmitButton
                        size="sm"
                        className="h-11 sm:h-8"
                        title="Open secure checkout for this charge."
                      >
                        Pay now
                      </SubmitButton>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-11 sm:h-8"
                      disabled
                      title={
                        stripeConfigured
                          ? "Online payment unavailable - property owner hasn't connected their bank account."
                          : "Online payment unavailable - Stripe is not configured."
                      }
                    >
                      Pay now
                    </Button>
                  )
                )
              ) : null}

              {showManualPayment && charge.status !== "paid" && charge.status !== "waived" && onToggleManualPayment ? (
                <Button
                  type="button"
                  size="sm"
                  variant={manualFormOpen ? "default" : "outline"}
                  className="h-11 sm:h-8"
                  disabled={isMutatingCharges}
                  onClick={onToggleManualPayment}
                  title="Record a manual payment for this charge."
                >
                  {manualFormOpen ? "Cancel" : "Record"}
                </Button>
              ) : null}

              {canModify ? (
                <ChargeMoreMenu
                  disabled={isMutatingCharges}
                  onEdit={onOpenEdit}
                  onWaive={onWaive}
                  onDelete={onDelete}
                />
              ) : null}
            </div>
          </div>

          {showManualPayment && manualFormOpen && charge.status !== "paid" && charge.status !== "waived" ? (
            <form action={manualPaymentAction} className="grid gap-3 sm:grid-cols-4">
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
                <SubmitButton size="sm" variant="outline" className="h-11 sm:h-8" title="Record this manual payment.">
                  Save Payment
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
