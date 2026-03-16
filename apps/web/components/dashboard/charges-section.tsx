"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { AutopayCard } from "./autopay-card";
import { AnimatedList } from "@/components/ui/animated-list";
import { formatCurrency, formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { getStatusClasses, statusBadgeClasses } from "@/lib/status-colors";

type ChargeStatus = "pending" | "paid" | "late";
type ChargeCategory = "rent" | "late_fee";
type ChargeFilter = "all" | ChargeStatus;

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

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
  onRecordManualPayment?: StatefulAction;
  onGenerateChargesHref?: string;
  showManualPayment?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  stripeConnected?: boolean;
  isTenantView?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
  onDisableAutopay?: StatefulAction;
}

const unavailableManualPaymentAction: StatefulAction = async () => ({
  success: false,
  error: "Manual payment recording is unavailable."
});

const unavailableAutopayAction: StatefulAction = async () => ({
  success: false,
  error: "Autopay management is unavailable."
});

function InlineAlert({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.success) {
    return (
      <Alert variant="success" className="mb-3">
        {state.message ?? "Payment recorded."}
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

export function ChargesSection({
  charges,
  onPayCharge,
  onRecordManualPayment,
  onGenerateChargesHref,
  showManualPayment = false,
  ownerConnectedMap,
  stripeConnected,
  isTenantView = false,
  autopayEnrollments = [],
  onSetupAutopay,
  onDisableAutopay
}: ChargesSectionProps) {
  const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<ChargeFilter>("all");
  const [manualPaymentChargeId, setManualPaymentChargeId] = useState<string | null>(null);
  const [manualPaymentState, recordManualPaymentAction] = useFormState(
    onRecordManualPayment ?? unavailableManualPaymentAction,
    null
  );

  useEffect(() => {
    if (manualPaymentState?.success) {
      setManualPaymentChargeId(null);
    }
  }, [manualPaymentState]);

  const filteredCharges = useMemo(() => {
    return charges.filter((charge) => activeFilter === "all" || charge.status === activeFilter);
  }, [activeFilter, charges]);

  const pendingCount = charges.filter((charge) => charge.status === "pending").length;
  const lateCount = charges.filter((charge) => charge.status === "late").length;
  const paidThisMonthCount = charges.filter((charge) => {
    if (charge.status !== "paid") return false;
    const dueDate = new Date(`${charge.dueDate}T00:00:00.000Z`);
    const now = new Date();
    return (
      dueDate.getUTCMonth() === now.getUTCMonth() &&
      dueDate.getUTCFullYear() === now.getUTCFullYear()
    );
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

  return (
    <Card id="charges" className="border border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-xl font-semibold">
          {isTenantView ? "Rent Payments" : "Upcoming / Late Charges"}
        </CardTitle>
        {onGenerateChargesHref ? (
          <Link
            href={onGenerateChargesHref}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            title="Generate rent charges for the current billing period."
          >
            Generate This Month Charges
          </Link>
        ) : null}
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
                  onSetupAutopay={onSetupAutopay ?? unavailableAutopayAction}
                  onDisableAutopay={onDisableAutopay ?? unavailableAutopayAction}
                />
              );
            })}
          </AnimatedList>
        ) : null}

        <div className="mb-4 rounded-xl border border-border/50 bg-zinc-50/80 px-3 py-2 text-sm shadow-sm">
          <span className="font-semibold text-amber-700">{pendingCount} pending</span>
          <span className="mx-2 text-zinc-400">•</span>
          <span className="font-semibold text-red-700">{lateCount} late</span>
          <span className="mx-2 text-zinc-400">•</span>
          <span className="font-semibold text-emerald-700">{paidThisMonthCount} paid this month</span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["pending", "Pending"],
            ["late", "Late"],
            ["paid", "Paid"]
          ] as Array<[ChargeFilter, string]>).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant="outline"
              className={
                activeFilter === value
                  ? "border-violet-300 bg-violet-50 font-semibold text-violet-700 shadow-sm"
                  : "font-medium"
              }
              onClick={() => setActiveFilter(value)}
              title={`Show ${label.toLowerCase()} charges.`}
            >
              {label}
            </Button>
          ))}
        </div>

        {showManualPayment ? <InlineAlert state={manualPaymentState} /> : null}

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
          <AnimatedList>
            {filteredCharges.map((charge, i) => {
              const manualFormOpen = manualPaymentChargeId === charge.id;
              const ownerConnected =
                ownerConnectedMap?.get(charge.propertyId) ??
                stripeConnected ??
                true;
              const paymentsAvailable = stripeConfigured && ownerConnected;
              const category = charge.category ?? "rent";

              return (
                <DataRow key={charge.id} last={i === filteredCharges.length - 1}>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-zinc-900">{getChargeLabel(charge)}</p>
                    {!isTenantView && charge.tenantName ? (
                      <p className="mt-0.5 text-sm text-zinc-500">{charge.tenantName}</p>
                    ) : null}
                    <p className="mt-0.5 text-sm text-zinc-500">Due {formatDate(charge.dueDate)}</p>

                    {showManualPayment && manualFormOpen && charge.status !== "paid" ? (
                      <form action={recordManualPaymentAction} className="mt-3 grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="chargeId" value={charge.id} />
                        <div className="space-y-1">
                          <label
                            className="block text-xs font-medium text-zinc-600"
                            htmlFor={`manual-payment-amount-${charge.id}`}
                          >
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
                          <label
                            className="block text-xs font-medium text-zinc-600"
                            htmlFor={`manual-payment-method-${charge.id}`}
                          >
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
                          <label
                            className="block text-xs font-medium text-zinc-600"
                            htmlFor={`manual-payment-reference-${charge.id}`}
                          >
                            Reference Note
                          </label>
                          <Input
                            id={`manual-payment-reference-${charge.id}`}
                            name="referenceNote"
                            placeholder="Optional"
                          />
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
                      <p className="text-base font-medium text-zinc-900">
                        {formatCurrency(charge.amountCents)}
                      </p>
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        <span className={statusBadgeClasses(charge.status)}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(charge.status).dot}`}
                          />
                          {statusLabel(charge.status)}
                        </span>
                        {category === "late_fee" ? (
                          <Badge variant="destructive">Late Fee</Badge>
                        ) : null}
                      </div>
                    </div>

                    {charge.status !== "paid" ? paymentsAvailable ? (
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
                    ) : null}

                    {showManualPayment && charge.status !== "paid" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={manualFormOpen ? "default" : "outline"}
                        onClick={() =>
                          setManualPaymentChargeId((current) =>
                            current === charge.id ? null : charge.id
                          )
                        }
                        title="Record a manual payment for this charge."
                      >
                        {manualFormOpen ? "Cancel" : "Record Payment"}
                      </Button>
                    ) : null}
                  </div>
                </DataRow>
              );
            })}
          </AnimatedList>
        )}
      </CardContent>
    </Card>
  );
}
