"use client";

import { daysBetween } from "@/lib/denver-calendar";
import { useDenverDayRefresh } from "@/components/dashboard/use-denver-day-refresh";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { formatCurrency, formatDate, formatMonthDay, formatMonthName } from "@/lib/format";
import type { TenantCharge } from "@/lib/tenant-payments";
import type { TenantPayState } from "@/lib/tenant-pay-state";
import { chargeBreakdown } from "@/lib/charge-breakdown";
import { PayRentCard, type AutopayEnrollmentView } from "@/components/dashboard/pay-rent-card";
import type { ActionState } from "@/app/actions";
import { isRentOpenForTenant } from "@/lib/rent-urgency";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TenantRentCardProps {
  charges: TenantCharge[];
  todayIso: string;
  payState: TenantPayState;
  rentDueDate: string | null;
  rentAmountCents: number | null;
  lastPaidAt: string | null;
  lateFeeCents?: number;
  onPayCharge: StatefulAction;
  onPayWithACH?: StatefulAction;
  onRequestManualPaymentConfirmation: StatefulAction;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
}

function relativeDueText(dueDate: string, todayIso: string) {
  const days = daysBetween(todayIso, dueDate);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
  if (days === 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function ReportPaidRow({ charge, action }: { charge: TenantCharge; action: StatefulAction }) {
  const [state, formAction] = useFormState(action, null);
  return (
    <div className="border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[var(--ink)]">
          {formatMonthDay(charge.dueDate)} rent · {formatCurrency(charge.amountCents)}
        </span>
        {state?.success ? (
          <span className="text-sm text-[var(--pos)]">
            {state.message ?? "Sent. Your landlord will check and mark it paid."}
          </span>
        ) : charge.tenantReportedPaidAt ? (
          <span className="text-sm text-[var(--pos)]">
            Sent {formatMonthDay(charge.tenantReportedPaidAt)}. Your landlord will check and mark it paid.
          </span>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="chargeId" value={charge.id} />
            <SubmitButton variant="outline" size="sm" className="min-h-11" title="Tell your landlord you paid this month.">
              I paid this
            </SubmitButton>
          </form>
        )}
      </div>
      {state && !state.success ? <p role="alert" className="mt-2 text-sm text-[var(--crit)]">{state.error}</p> : null}
    </div>
  );
}

export function TenantRentCard({
  charges,
  todayIso,
  payState,
  rentDueDate,
  rentAmountCents,
  lastPaidAt,
  lateFeeCents = 0,
  onPayCharge,
  onPayWithACH,
  onRequestManualPaymentConfirmation,
  autopayEnrollments = [],
  onSetupAutopay
}: TenantRentCardProps) {
  const [showPayment, setShowPayment] = useState(false);
  useDenverDayRefresh(todayIso);
  const unpaidCharges = charges.filter((item) =>
    (item.status === "pending" || item.status === "late") && isRentOpenForTenant(item.dueDate, todayIso));
  const futureCharge = charges.filter((item) =>
    (item.status === "pending" || item.status === "late") && !isRentOpenForTenant(item.dueDate, todayIso))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const charge = unpaidCharges[0] ?? null;
  const dueDate = unpaidCharges.map((item) => item.dueDate).sort()[0] ?? charge?.dueDate ?? rentDueDate;
  const amountCents = ["can_pay", "not_ready", "outside"].includes(payState)
    ? unpaidCharges.reduce((total, item) => total + item.amountCents, 0)
    : rentAmountCents ?? charge?.amountCents ?? 0;
  const dueMonthCount = new Set(unpaidCharges.map((item) => item.dueDate.slice(0, 7))).size;
  const amountLabel = ["can_pay", "not_ready", "outside"].includes(payState) && unpaidCharges.length > 1
    ? `${formatCurrency(amountCents)} · ${dueMonthCount} month${dueMonthCount === 1 ? "" : "s"}`
    : formatCurrency(amountCents);
  const label = futureCharge && !charge ? "Next rent" : payState === "paid" && lastPaidAt
    ? `${formatMonthName(lastPaidAt)} rent`
    : payState === "not_posted" ? "Next rent" : "Rent due";

  if (payState === "no_lease") {
    return (
      <Card className="domus-card">
        <CardContent className="space-y-2 p-5 sm:p-7">
          <h2 className="font-display text-[18px] font-semibold text-[var(--ink)]">Your lease isn&apos;t set up yet</h2>
          <p className="text-sm text-[var(--muted)]">
            Your landlord is still setting things up. You&apos;ll see your rent here once it&apos;s ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (showPayment && payState === "can_pay") {
    return <PayRentCard charges={charges} todayIso={todayIso} onPayCharge={onPayCharge} onPayWithACH={onPayWithACH}
      onRequestManualPaymentConfirmation={onRequestManualPaymentConfirmation} chargesHref="/tenant?section=charges"
      autopayEnrollments={autopayEnrollments} onSetupAutopay={onSetupAutopay} payState={payState}
      rentDueDate={rentDueDate} rentAmountCents={rentAmountCents} lastPaidAt={lastPaidAt} />;
  }

  return (
    <Card className="domus-card">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
          {futureCharge && !charge ? (
            <p className="mt-1 text-sm text-[var(--ink)]">
              {formatCurrency(futureCharge.amountCents)} on {formatMonthDay(futureCharge.dueDate)}.
            </p>
          ) : <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-[var(--ink)]">{amountLabel}</p>}
          {charge?.lines?.length ? <p className="mt-2 text-sm text-[var(--muted)]">
            Rent {formatCurrency(chargeBreakdown({ id: charge.id, amount_cents: charge.amountCents },
              charge.lines).rentCents)}
            {charge.lines.map((line) => ` · ${line.label} ${formatCurrency(line.amount_cents)}`).join("")}
          </p> : null}
          {dueDate && payState !== "paid" && !(futureCharge && !charge) ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {payState === "not_posted" ? `due ${formatMonthDay(dueDate)}`
                : `due ${formatMonthDay(dueDate)} · ${relativeDueText(dueDate, todayIso)}`}
            </p>
          ) : null}
          {futureCharge && charge ? <p className="mt-2 text-sm text-[var(--muted)]">
            {formatCurrency(futureCharge.amountCents)} on {formatMonthDay(futureCharge.dueDate)}.
          </p> : null}
        </div>
        {payState === "can_pay" && unpaidCharges.length > 0 ? (
          <div className="space-y-3">
            <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => setShowPayment(true)} title="Choose how to pay your rent.">Pay rent</Button>
            <p className="text-sm text-[var(--muted)]">Bank transfer is free. Cards have a small fee.</p>
            {dueDate && new Date(`${dueDate}T00:00:00.000Z`) < new Date() && lateFeeCents > 0 ? <p className="text-sm text-[var(--warn)]">A {formatCurrency(lateFeeCents)} late fee may apply.</p> : null}
          </div>
        ) : null}
        {payState === "not_ready" ? (
          <div className="border-l-[3px] border-[var(--accent)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--ink)]">Online pay isn&apos;t on yet</p>
            <p className="mt-1">Your landlord is still setting it up. Pay them the way you usually do for now.</p>
          </div>
        ) : null}
        {payState === "outside" ? <div className="rounded-xl bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">You pay your landlord outside Domus.</div> : null}
        {(payState === "not_ready" || payState === "outside") && unpaidCharges.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--ink)]">Already paid? Tell your landlord.</p>
            <div className="space-y-3">
              {[...unpaidCharges].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((item) => (
                <ReportPaidRow key={item.id} charge={item} action={onRequestManualPaymentConfirmation} />
              ))}
            </div>
          </div>
        ) : null}
        {payState === "paid" && lastPaidAt ? <div className="rounded-xl bg-[var(--pos-bg)] p-4 text-sm font-semibold text-[var(--pos)]">Paid {formatDate(lastPaidAt)}. Thank you!</div> : null}
        {payState === "not_posted" && !futureCharge ? (
          <p className="text-sm text-[var(--muted)]">You can pay once it&apos;s posted.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
