import { Home, CalendarClock } from "lucide-react";
import type { TenantLeaseDetails as TenantLeaseDetailsItem } from "@/lib/leases";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

interface TenantLeaseDetailsProps {
  leases: TenantLeaseDetailsItem[];
}

function LeaseStatusBadge({
  status,
  daysRemaining
}: {
  status: string;
  daysRemaining: number;
}) {
  if (status === "terminated") {
    return <Badge variant="destructive">Ended</Badge>;
  }

  if (status === "renewed") {
    return <Badge variant="default">Renewed</Badge>;
  }

  if (status === "expired") {
    return <Badge variant="warning">Expired</Badge>;
  }

  if (daysRemaining <= 30) {
    return <Badge variant="warning">Expiring Soon</Badge>;
  }

  return <Badge variant="success">Active</Badge>;
}

export function TenantLeaseDetails({ leases }: TenantLeaseDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Lease</CardTitle>
      </CardHeader>
      <CardContent>
        {leases.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No active lease"
            description="Your current lease details will appear here once a lease is active on your account."
          />
        ) : (
          <div className="space-y-4">
            {leases.map((lease) => (
              <div key={lease.leaseId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-900">
                        {lease.propertyName} • Unit {lease.unitNumber}
                      </h3>
                      <LeaseStatusBadge status={lease.leaseStatus} daysRemaining={lease.daysRemaining} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[var(--surface)] px-3 py-2 text-right shadow-[var(--domus-shadow-sm)]">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Days Remaining</p>
                    <p className="text-lg font-semibold text-zinc-900">{lease.daysRemaining}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Monthly Rent</p>
                    <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(lease.monthlyRentCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Security Deposit</p>
                    <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(lease.depositCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Due Day</p>
                    <p className="mt-1 font-semibold text-zinc-900">Day {lease.dueDayOfMonth}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Late Fee</p>
                    <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(lease.lateFeeCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Grace Period</p>
                    <p className="mt-1 font-semibold text-zinc-900">{lease.gracePeriodDays} days</p>
                  </div>
                  <div className="flex items-end">
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
                      <CalendarClock className="mr-2 inline h-4 w-4 text-zinc-400" />
                      Ends {formatDate(lease.endDate)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
