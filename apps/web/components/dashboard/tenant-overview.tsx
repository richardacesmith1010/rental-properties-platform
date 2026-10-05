"use client";

import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import type { TenantCharge } from "@/lib/tenant-payments";
import { Card, CardContent } from "@/components/ui/card";
import { PayRentCard, type AutopayEnrollmentView } from "@/components/dashboard/pay-rent-card";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";
import type { TenantPayState } from "@/lib/tenant-pay-state";

type TenantOverviewSection = "charges" | "maintenance" | "documents" | "notifications";
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function buildSectionHref(section: TenantOverviewSection): string {
  return `/tenant?section=${section}`;
}

interface TenantOverviewProps {
  userName: string;
  charges: TenantCharge[];
  nextCharge: { amountCents: number; dueDate: string } | null;
  lease: {
    startDate: string;
    endDate: string;
    propertyName: string;
    unitLabel: string;
    monthlyRentCents: number;
  } | null;
  openTicketCount: number;
  tickets?: Array<{ id: string; title: string; status: string }>;
  payState?: TenantPayState;
  rentDueDate?: string | null;
  rentAmountCents?: number | null;
  lastPaidAt?: string | null;
  onPayCharge: (formData: FormData) => Promise<void>;
  onPayWithACH?: (formData: FormData) => Promise<void>;
  onRequestManualPaymentConfirmation: StatefulAction;
  hasActiveLease?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
}

function getDaysUntil(dateValue: string) {
  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dueDate = new Date(`${dateValue}T00:00:00.000Z`);
  const dueStart = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  return Math.ceil((dueStart - todayStart) / (1000 * 60 * 60 * 24));
}

export function TenantOverview({
  userName: _userName,
  charges,
  nextCharge,
  lease,
  openTicketCount,
  tickets = [],
  payState,
  rentDueDate,
  rentAmountCents,
  lastPaidAt,
  onPayCharge,
  onPayWithACH,
  onRequestManualPaymentConfirmation,
  hasActiveLease = true,
  autopayEnrollments = [],
  onSetupAutopay
}: TenantOverviewProps) {
  const summary = (() => {
    if (!nextCharge) {
      return hasActiveLease ? "No rent posted yet." : "Your landlord hasn't set up your lease yet.";
    }

    const daysUntil = getDaysUntil(nextCharge.dueDate);
    if (daysUntil < 0) {
      return isCollectedOutsideDomus(charges[0])
        ? `You pay ${formatCurrency(nextCharge.amountCents)} outside Domus.`
        : `${formatCurrency(nextCharge.amountCents)} is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} late.`;
    }
    if (daysUntil === 0) {
      return `Your rent of ${formatCurrency(nextCharge.amountCents)} is due today.`;
    }
    return `Your rent of ${formatCurrency(nextCharge.amountCents)} is due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}.`;
  })();

  return (
    <div className="space-y-6">
      <PayRentCard
        charges={charges}
        onPayCharge={onPayCharge}
        onPayWithACH={onPayWithACH}
        onRequestManualPaymentConfirmation={onRequestManualPaymentConfirmation}
        chargesHref={buildSectionHref("charges")}
        hasActiveLease={hasActiveLease}
        autopayEnrollments={autopayEnrollments}
        onSetupAutopay={onSetupAutopay}
        payState={payState}
        rentDueDate={rentDueDate}
        showManualPaymentControl={false}
        rentAmountCents={rentAmountCents}
        lastPaidAt={lastPaidAt}
      />

      <div>
        {lease ? <p className="text-sm font-medium text-muted-foreground">{lease.propertyName} · {formatUnitLabel(lease.unitLabel)}</p> : null}
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={buildSectionHref("maintenance")} className="domus-card flex min-h-16 items-center justify-between p-4" title="Report a problem.">
          <span className="flex items-center gap-3"><Wrench className="h-5 w-5 text-[var(--accent)]" /><span className="font-semibold">Report a problem</span></span><ChevronRight className="h-4 w-4" />
        </Link>
        <Link href={buildSectionHref("notifications")} className="domus-card flex min-h-16 items-center justify-between p-4" title="Message your landlord.">
          <span className="font-semibold">Message landlord</span><ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Your problems</h2><Link href={buildSectionHref("maintenance")} className="text-sm font-semibold text-[var(--accent)]" title="See all problems.">See all</Link></div>
        {tickets.length > 0 ? tickets.slice(0, 3).map((ticket) => <div key={ticket.id} className="domus-card flex items-center justify-between p-4"><span className="truncate text-sm font-medium">{ticket.title}</span><span className="rounded-full bg-[var(--accent-weak)] px-2 py-1 text-xs capitalize text-[var(--accent)]">{ticket.status.replaceAll("_", " ")}</span></div>) : <p className="text-sm text-muted-foreground">{openTicketCount > 0 ? `${openTicketCount} open problems.` : "No open problems."}</p>}
      </section>

      {lease ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="p-5">
            <Link href={buildSectionHref("documents")} className="flex items-center justify-between text-lg font-semibold text-foreground" title="See your lease details."><span>Your lease</span><ChevronRight className="h-4 w-4" /></Link>
            <div className="mt-4 grid gap-y-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
              <span className="text-sm text-muted-foreground">Property</span>
              <span className="text-sm font-medium text-foreground">
                {lease.propertyName} - {formatUnitLabel(lease.unitLabel)}
              </span>
              <span className="text-sm text-muted-foreground">Lease Period</span>
              <span className="text-sm text-foreground">
                {formatDate(lease.startDate)} – {formatDate(lease.endDate)}
              </span>
              <span className="text-sm text-muted-foreground">Monthly Rent</span>
              <span className="text-sm font-medium text-foreground">
                {formatCurrency(lease.monthlyRentCents)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
