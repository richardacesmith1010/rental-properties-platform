"use client";

import Link from "next/link";
import { CreditCard, FileText, MessageSquareText, Wrench } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import type { TenantCharge } from "@/lib/tenant-payments";
import { Card, CardContent } from "@/components/ui/card";
import { PayRentCard, type AutopayEnrollmentView } from "@/components/dashboard/pay-rent-card";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

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
  userName,
  charges,
  nextCharge,
  lease,
  openTicketCount,
  onPayCharge,
  onPayWithACH,
  onRequestManualPaymentConfirmation,
  hasActiveLease = true,
  autopayEnrollments = [],
  onSetupAutopay
}: TenantOverviewProps) {
  const greeting = useTimeOfDayGreeting();
  const summary = (() => {
    if (!nextCharge) {
      if (!hasActiveLease) {
        return "Your landlord hasn't set up your lease yet.";
      }
      return "You're all caught up - no payments due.";
    }

    const daysUntil = getDaysUntil(nextCharge.dueDate);
    if (daysUntil < 0) {
      return `You have a payment of ${formatCurrency(nextCharge.amountCents)} that is overdue.`;
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
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {greeting ? `${greeting}, ${userName}` : userName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickActionCard
          href={buildSectionHref("charges")}
          icon={CreditCard}
          title="Rent"
          description={nextCharge ? "Pay your rent and review receipts." : "Review your payment history and receipts."}
        />
        <QuickActionCard
          href={buildSectionHref("maintenance")}
          icon={Wrench}
          title="Problems"
          description={openTicketCount > 0 ? `${openTicketCount} problem${openTicketCount === 1 ? "" : "s"} currently open.` : "Report an issue in your home."}
        />
        <QuickActionCard
          href={buildSectionHref("notifications")}
          icon={MessageSquareText}
          title="Messages"
          description="Read updates from your landlord and reply in one place."
        />
        <QuickActionCard
          href={buildSectionHref("documents")}
          icon={FileText}
          title="Lease"
          description="Open your lease packet and shared rental documents."
        />
      </div>

      {lease ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold text-foreground">Your Lease</h2>
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

function QuickActionCard({
  href,
  icon: Icon,
  title,
  description
}: {
  href: string;
  icon: typeof CreditCard;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      title={description}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
