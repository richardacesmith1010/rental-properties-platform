import Link from "next/link";
import { CreditCard, FileText, Wrench } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

type TenantOverviewSection = "charges" | "maintenance" | "documents";

interface TenantOverviewProps {
  userName: string;
  nextCharge: { amountCents: number; dueDate: string } | null;
  lease: {
    startDate: string;
    endDate: string;
    propertyName: string;
    unitLabel: string;
    monthlyRentCents: number;
  } | null;
  openTicketCount: number;
  buildSectionHref: (section: TenantOverviewSection) => string;
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  return "Good evening";
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
  nextCharge,
  lease,
  openTicketCount,
  buildSectionHref
}: TenantOverviewProps) {
  const summary = (() => {
    if (!nextCharge) {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          {getGreeting()}, {userName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickActionCard
          href={buildSectionHref("charges")}
          icon={CreditCard}
          title="Pay Rent"
          description={nextCharge ? "Review your open balance and checkout options." : "Review your payment history and receipts."}
        />
        <QuickActionCard
          href={buildSectionHref("maintenance")}
          icon={Wrench}
          title="Submit Request"
          description={openTicketCount > 0 ? `${openTicketCount} request${openTicketCount === 1 ? "" : "s"} currently open.` : "Report an issue in your home."}
        />
        <QuickActionCard
          href={buildSectionHref("documents")}
          icon={FileText}
          title="View Documents"
          description="Access your lease packet and shared files."
        />
      </div>

      <Card className="border border-border/50 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500">Next Payment Due</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">
              {nextCharge ? formatCurrency(nextCharge.amountCents) : formatCurrency(0)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {nextCharge ? formatDate(nextCharge.dueDate) : "No payment due right now"}
            </p>
          </div>
          <Link
            href={buildSectionHref("charges")}
            className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            title="Open your rent charges and payment options."
          >
            {nextCharge ? "Pay Now" : "View Charges"}
          </Link>
        </CardContent>
      </Card>

      {lease ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Your Lease</h2>
            <div className="mt-4 grid gap-y-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
              <span className="text-sm text-zinc-500">Property</span>
              <span className="text-sm font-medium text-zinc-900">
                {lease.propertyName} - Unit {lease.unitLabel}
              </span>
              <span className="text-sm text-zinc-500">Lease Period</span>
              <span className="text-sm text-zinc-900">
                {formatDate(lease.startDate)} – {formatDate(lease.endDate)}
              </span>
              <span className="text-sm text-zinc-500">Monthly Rent</span>
              <span className="text-sm font-medium text-zinc-900">
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
        <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
      </div>
    </Link>
  );
}
