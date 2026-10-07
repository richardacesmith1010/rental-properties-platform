"use client";

import {
  Mail,
  MessageSquare
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { ChargeMoreMenu } from "@/components/dashboard/charge-more-menu";
import { ManualPaymentForm } from "@/components/dashboard/manual-payment-form";
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
  tenantReportedPaidAt?: string | null;
  latestEditedAt?: string | null;
  latestEditedByName?: string | null;
  editedCount?: number;
  collectsOutsideDomus?: boolean;
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
  tenantPayState?: "can_pay" | "not_ready" | "outside" | "paid" | "not_posted";
  stripeConfigured: boolean;
  onPayCharge: (formData: FormData) => Promise<void>;
  onPayWithACH?: (formData: FormData) => Promise<void>;
  showManualPayment: boolean;
  manualFormOpen: boolean;
  manualPaymentAction: (formData: FormData) => void;
  onToggleManualPayment?: () => void;
  onOpenEdit?: () => void;
  onWaive?: () => void;
  onDelete?: () => void;
  onOpenMessage?: () => void;
  onSendReminder?: () => void;
  /** @deprecated Use simpleView. Kept for existing component tests. */
  ownerView?: boolean;
  simpleView?: boolean;
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

export { ManualPaymentForm } from "@/components/dashboard/manual-payment-form";

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
  tenantPayState,
  stripeConfigured,
  onPayCharge,
  onPayWithACH,
  showManualPayment,
  manualFormOpen,
  manualPaymentAction,
  onToggleManualPayment,
  onOpenEdit,
  onWaive,
  onDelete,
  onOpenMessage,
  onSendReminder,
  ownerView = false,
  simpleView: simpleViewProp,
  isMutatingCharges
}: ChargeRowProps) {
  const simpleView = simpleViewProp ?? ownerView;
  const label = getChargeLabel(charge);
  const cardPayment = calculateCardFee(charge.amountCents);

  return (
    <div
      id={`charge-${charge.id}`}
      className={cn(
        [
          "rounded-2xl px-2 py-3 transition-all duration-150",
          "hover:bg-[color:color-mix(in_srgb,var(--accent-weak)_72%,transparent)] hover:shadow-sm sm:px-3"
        ].join(" "),
        last ? "" : "border-b border-[color:color-mix(in_srgb,var(--line)_82%,transparent)]"
      )}
    >
      <div className="flex gap-3">
        {batchActionsEnabled ? (
          <div className="flex items-start pt-1">
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => onToggleSelection(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
              aria-label={`Select payment for ${label}`}
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
                {!isTenantView && category === "rent" && (charge.status === "pending" || charge.status === "late")
                  && charge.tenantReportedPaidAt ? (
                    <span
                      className={[
                        "inline-flex items-center rounded-full border border-[var(--accent-line)]",
                        "px-2 py-0.5 text-xs text-[var(--accent)]"
                      ].join(" ")}
                      title="Your tenant says they paid. Check, then tap Mark paid."
                    >
                      Tenant says paid · {new Intl.DateTimeFormat("en-US", {
                        month: "short", day: "numeric", timeZone: "UTC"
                      }).format(new Date(`${charge.tenantReportedPaidAt.slice(0, 10)}T00:00:00.000Z`))}
                    </span>
                  ) : null}
                {category !== "rent" ? (
                  <Badge variant="outline">{chargeCategoryLabel(category)}</Badge>
                ) : null}
              </div>

              {!isTenantView && charge.tenantName ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{charge.tenantName}</span>
                  {onOpenMessage && !simpleView ? (
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
                      : "Payment has been edited."
                  }
                >
                  Edited {charge.editedCount}x
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {simpleView && onSendReminder && charge.status !== "paid" && charge.status !== "waived" ? (
                <Button type="button" size="sm" variant="ghost" className="h-11" onClick={onSendReminder} title="Send a rent reminder.">
                  Remind
                </Button>
              ) : null}
              {isTenantView &&
              (tenantPayState === undefined || tenantPayState === "can_pay") &&
              charge.status !== "paid" &&
              charge.status !== "waived" ? (
                <div className="w-full space-y-2 xl:w-[18rem]">
                  <div
                    className={[
                      "rounded-2xl border border-[var(--accent-line)]",
                      "bg-[color:color-mix(in_srgb,var(--accent-weak)_76%,transparent)] p-3"
                    ].join(" ")}
                  >
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

                  <div className="rounded-2xl border border-border bg-background/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Pay from bank account</p>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pos)]">
                          FREE
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">No extra fees</p>
                      {paymentsAvailable && onPayWithACH ? (
                        <form action={onPayWithACH} className="mt-3">
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <SubmitButton
                            size="sm"
                            variant="outline"
                            className="h-11 w-full"
                            title={`Pay ${formatCentsAsDollars(charge.amountCents)} from your bank account.`}
                          >
                            Pay {formatCentsAsDollars(charge.amountCents)}
                          </SubmitButton>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 h-11 w-full"
                          disabled
                          title={
                            stripeConfigured
                              ? "Online payment is not ready for this property yet."
                              : "Online payment is not available right now."
                          }
                        >
                          Pay {formatCentsAsDollars(charge.amountCents)}
                        </Button>
                      )}
                  </div>
                </div>
              ) : null}

              {showManualPayment && charge.status !== "paid" && charge.status !== "waived" && onToggleManualPayment ? (
                <Button
                  type="button"
                  size="sm"
                  variant={manualFormOpen ? "default" : "outline"}
                  className={simpleView ? "h-11" : "h-11 sm:h-8"}
                  disabled={isMutatingCharges}
                  onClick={onToggleManualPayment}
                  title="Record a manual payment for this amount owed."
                >
                  {manualFormOpen ? "Cancel" : simpleView ? "Mark paid" : "Record"}
                </Button>
              ) : null}

              {canModify ? (
                <ChargeMoreMenu
                  disabled={isMutatingCharges}
                  onEdit={onOpenEdit}
                  onWaive={onWaive}
                  onDelete={onDelete}
              onMessage={simpleView ? onOpenMessage : undefined}
              compact={simpleView}
                />
              ) : null}
            </div>
          </div>

          {showManualPayment && manualFormOpen && charge.status !== "paid" && charge.status !== "waived" ? (
            <ManualPaymentForm charge={charge} action={manualPaymentAction} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
