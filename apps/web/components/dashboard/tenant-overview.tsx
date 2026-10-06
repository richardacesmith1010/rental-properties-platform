"use client";

import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import type { TenantCharge } from "@/lib/tenant-payments";
import { Card, CardContent } from "@/components/ui/card";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";
import type { AutopayEnrollmentView } from "@/components/dashboard/pay-rent-card";
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
  lateFeeCents?: number;
  onPayCharge: StatefulAction;
  onPayWithACH?: StatefulAction;
  onRequestManualPaymentConfirmation: StatefulAction;
  hasActiveLease?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
}

export function TenantOverview({
  userName: _userName,
  charges,
  nextCharge: _nextCharge,
  lease,
  openTicketCount,
  tickets = [],
  payState,
  rentDueDate,
  rentAmountCents,
  lastPaidAt,
  lateFeeCents = 0,
  onPayCharge,
  onPayWithACH,
  onRequestManualPaymentConfirmation,
  hasActiveLease: _hasActiveLease = true,
  autopayEnrollments = [],
  onSetupAutopay
}: TenantOverviewProps) {
  return (
    <div className="space-y-6">
      <TenantRentCard
        charges={charges}
        onPayCharge={onPayCharge}
        onPayWithACH={onPayWithACH}
        onRequestManualPaymentConfirmation={onRequestManualPaymentConfirmation}
        autopayEnrollments={autopayEnrollments}
        onSetupAutopay={onSetupAutopay}
        payState={payState ?? "not_posted"}
        rentDueDate={rentDueDate ?? null}
        rentAmountCents={rentAmountCents ?? null}
        lastPaidAt={lastPaidAt ?? null}
        lateFeeCents={lateFeeCents}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={buildSectionHref("maintenance")} className="domus-card flex min-h-16 items-center justify-between p-4" title="Report a problem.">
          <span className="flex items-center gap-3"><Wrench className="h-5 w-5 text-[var(--accent)]" /><span className="font-semibold">Report a problem</span></span><ChevronRight className="h-4 w-4" />
        </Link>
        <Link href={buildSectionHref("notifications")} className="domus-card flex min-h-16 items-center justify-between p-4" title="Message your landlord.">
          <span className="font-semibold">Message landlord</span><ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your problems</h2>
          <Link
            href={buildSectionHref("maintenance")}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]"
            title="See all problems."
          >
            See all
          </Link>
        </div>
        {tickets.length > 0 ? tickets.slice(0, 3).map((ticket) => <div key={ticket.id} className="domus-card flex items-center justify-between p-4"><span className="truncate text-sm font-medium">{ticket.title}</span><span className="rounded-full bg-[var(--accent-weak)] px-2 py-1 text-xs capitalize text-[var(--accent)]">{ticket.status.replaceAll("_", " ")}</span></div>) : <p className="text-sm text-muted-foreground">{openTicketCount > 0 ? `${openTicketCount} open problems.` : "No open problems."}</p>}
      </section>

      {lease ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="p-5">
            <Link
              href={buildSectionHref("documents")}
              className="flex min-h-11 items-center justify-between text-lg font-semibold text-foreground"
              title="See your lease details."
            >
              <span>Your lease</span><ChevronRight className="h-4 w-4" />
            </Link>
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
