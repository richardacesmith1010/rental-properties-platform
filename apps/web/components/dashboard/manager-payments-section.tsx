"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Download, Pencil, ReceiptText } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  ManagerAssignmentOption,
  ManagerPaymentConfigDTO,
  ManagerPaymentDTO
} from "@/lib/manager-payments";
import { statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";
import { buildEntityUpdateFormData, buildManagerEditFields } from "@/lib/entity-edit-fields";
import { ManagerConfigForm } from "./manager-config-form";
import { ManagerPaymentForm } from "./manager-payment-form";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyOption {
  id: string;
  name: string;
}

interface ManagerPaymentsSectionProps {
  configs: ManagerPaymentConfigDTO[];
  payments: ManagerPaymentDTO[];
  managers: ManagerAssignmentOption[];
  properties: PropertyOption[];
  warning?: string | null;
  onSetupManagerPaymentConfig?: StatefulAction;
  onRecordManagerPayment?: StatefulAction;
  onUpdateManagerInfo?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onCancelManagerPayment?: StatefulAction;
  onGenerateMonthlyManagerPayments?: StatefulAction;
  previewCount?: number;
}

export function ManagerPaymentsSection({
  configs,
  payments,
  managers,
  properties,
  warning,
  onSetupManagerPaymentConfig,
  onRecordManagerPayment,
  onUpdateManagerInfo,
  onMarkManagerPaymentPaid,
  onCancelManagerPayment,
  onGenerateMonthlyManagerPayments,
  previewCount
}: ManagerPaymentsSectionProps) {
  const router = useRouter();
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ManagerPaymentConfigDTO | null>(null);
  const [statusMessage, setStatusMessage] = useState<ActionState>(null);
  const [isPending, startTransition] = useTransition();

  const baseRentCentsByProperty = useMemo(() => {
    const next: Record<string, number> = {};
    for (const config of configs) {
      if (config.baseRentCents != null && next[config.propertyId] == null) {
        next[config.propertyId] = config.baseRentCents;
      }
    }
    return next;
  }, [configs]);

  const pendingPayments = payments.filter((payment) => payment.status === "pending");
  const historyPayments = payments.filter((payment) => payment.status !== "pending");
  const visiblePendingPayments = previewCount && !expanded ? pendingPayments.slice(0, previewCount) : pendingPayments;
  const visibleHistoryPayments = previewCount && !expanded ? historyPayments.slice(0, previewCount) : historyPayments;
  const hasMore =
    previewCount != null && (pendingPayments.length > previewCount || historyPayments.length > previewCount);

  const handleStatusUpdate = (paymentId: string, status: "paid" | "cancelled") => {
    const action = status === "paid" ? onMarkManagerPaymentPaid : onCancelManagerPayment;
    if (!action) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("paymentId", paymentId);
      formData.set("status", status);
      const result = await action(null, formData);
      setStatusMessage(result);
      if (result?.success) {
        router.refresh();
      }
    });
  };

  const handleGenerateMonthlyPayments = () => {
    if (!onGenerateMonthlyManagerPayments) {
      return;
    }

    startTransition(async () => {
      const result = await onGenerateMonthlyManagerPayments(null, new FormData());
      setStatusMessage(result);
      if (result?.success) {
        router.refresh();
      }
    });
  };

  if (warning && configs.length === 0 && payments.length === 0) {
    return <FeatureWarning title="Manager Payments Unavailable" message={warning} />;
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold">Manager Payments</CardTitle>
            <p className="text-sm text-muted-foreground">
              Track recurring management fees, reimbursements, and invoice history per property.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onRecordManagerPayment ? (
              <Button type="button" onClick={() => setShowPaymentForm((current) => !current)} title="Record a reimbursement or custom manager payment.">
                Record Payment
              </Button>
            ) : null}
            {onGenerateMonthlyManagerPayments ? (
              <Button type="button" variant="outline" onClick={handleGenerateMonthlyPayments} title="Generate this month's recurring manager payments.">
                Generate This Month
              </Button>
            ) : null}
            {onSetupManagerPaymentConfig ? (
              <Button type="button" variant="outline" onClick={() => setShowConfigForm((current) => !current)} title="Set up a recurring payment for an assigned manager.">
                Set Up Recurring
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage && !statusMessage.success ? <Alert variant="error">{statusMessage.error}</Alert> : null}
          {statusMessage?.success ? <Alert variant="success">{statusMessage.message ?? "Manager payment updated."}</Alert> : null}
          {warning ? <FeatureWarning title="Manager payment storage pending" message={warning} /> : null}
          {showConfigForm && onSetupManagerPaymentConfig ? (
            <ManagerConfigForm
              properties={properties}
              managers={managers}
              baseRentCentsByProperty={baseRentCentsByProperty}
              action={onSetupManagerPaymentConfig}
              onSuccess={() => {
                setShowConfigForm(false);
                router.refresh();
              }}
              onCancel={() => setShowConfigForm(false)}
            />
          ) : null}
          {showPaymentForm && onRecordManagerPayment ? (
            <ManagerPaymentForm
              properties={properties}
              managers={managers}
              action={onRecordManagerPayment}
              onSuccess={() => {
                setShowPaymentForm(false);
                router.refresh();
              }}
              onCancel={() => setShowPaymentForm(false)}
            />
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active payment configs</h3>
              <span className="text-sm text-muted-foreground">{configs.length} active</span>
            </div>
            {configs.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No recurring manager payments"
                description="Set up recurring commission or flat fees after assigning a property manager."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {configs.map((config) => (
                  <div key={config.id} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-foreground">{config.label}</p>
                        <p className="text-sm text-muted-foreground">{config.propertyName}</p>
                        <p className="text-sm text-muted-foreground">{config.managerName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {config.paymentType === "percentage"
                            ? `${config.percentageRate?.toFixed(2) ?? "0.00"}%`
                            : formatCurrency(config.flatAmountCents ?? 0)}
                        </span>
                        {onUpdateManagerInfo ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-md"
                            onClick={() => setEditingConfig(config)}
                            title={`Edit ${config.managerName}`}
                            aria-label={`Edit ${config.managerName}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Calculated amount</p>
                        <p className="mt-1 font-semibold text-foreground">{formatCurrency(config.calculatedAmountCents)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Base rent</p>
                        <p className="mt-1 font-semibold text-foreground">{formatCurrency(config.baseRentCents ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pending payments</h3>
              <span className="text-sm text-muted-foreground">{pendingPayments.length} pending</span>
            </div>
            {pendingPayments.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No pending manager payments"
                description="Generated invoices and one-off payments awaiting payment will appear here."
              />
            ) : (
              <div className="space-y-3">
                {visiblePendingPayments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">{payment.description}</p>
                          <span className={statusBadgeClasses(payment.status)} aria-label={statusAriaLabel(payment.status, "Manager payment status")}>
                            {payment.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{payment.propertyName} • {payment.managerName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Invoice {payment.invoiceNumber ?? "Pending"} • {formatDate(payment.paymentDate)}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2 lg:items-end">
                        <p className="text-lg font-semibold text-foreground">{formatCurrency(payment.amountCents)}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleStatusUpdate(payment.id, "paid")}
                            title="Mark this manager payment as paid."
                          >
                            Mark Paid
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => handleStatusUpdate(payment.id, "cancelled")}
                            title="Cancel this manager payment."
                          >
                            Cancel
                          </Button>
                          <Link
                            href={`/api/pdf/invoice/${payment.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                            title="Download the PDF invoice for this manager payment."
                          >
                            <Download className="h-4 w-4" />
                            Invoice
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payment history</h3>
              <span className="text-sm text-muted-foreground">{historyPayments.length} recorded</span>
            </div>
            {historyPayments.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No manager payment history"
                description="Paid or cancelled manager invoices will show up here once recorded."
              />
            ) : (
              <div className="space-y-3">
                {visibleHistoryPayments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{payment.description}</p>
                          <span className={statusBadgeClasses(payment.status)} aria-label={statusAriaLabel(payment.status, "Manager payment status")}>
                            {payment.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {payment.propertyName} • {payment.managerName} • {formatDate(payment.paymentDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{formatCurrency(payment.amountCents)}</span>
                        <Link
                          href={`/api/pdf/invoice/${payment.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          title="Download the PDF invoice for this manager payment."
                        >
                          <Download className="h-4 w-4" />
                          Invoice
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {hasMore ? (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setExpanded((current) => !current)} title={expanded ? "Collapse the manager payment history preview." : "Show the full manager payment history."}>
                {expanded ? "Show less" : `View all manager payments (${payments.length})`}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {editingConfig && onUpdateManagerInfo ? (
        <EntityEditModal
          open
          onClose={() => setEditingConfig(null)}
          title="Edit Manager"
          entityType="manager"
          fields={buildManagerEditFields(editingConfig)}
          onSave={async (updates) => {
            const result = await onUpdateManagerInfo(
              null,
              buildEntityUpdateFormData(
                {
                  propertyId: editingConfig.propertyId,
                  managerProfileId: editingConfig.managerProfileId,
                  configId: editingConfig.id
                },
                updates
              )
            );
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "Manager details updated." };
            }
            return { error: result?.error ?? "Unable to update this manager right now." };
          }}
        />
      ) : null}
    </div>
  );
}
