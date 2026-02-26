import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import type { LeaseListItem } from "@/lib/portfolio";

interface LeasesSectionProps {
  leases: LeaseListItem[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export function LeasesSection({ leases }: LeasesSectionProps) {
  return (
    <Card id="leases">
      <CardHeader>
        <CardTitle>Active Leases</CardTitle>
      </CardHeader>
      <CardContent>
        {leases.length === 0 ? (
          <EmptyState message="No leases created yet." />
        ) : (
          <div>
            {leases.map((lease, i) => (
              <DataRow key={lease.id} last={i === leases.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{lease.unitLabel}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{lease.tenantEmail}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-900">
                    {dollars(lease.monthlyRentCents)}
                  </p>
                  <p className="text-xs text-zinc-500">Due day {lease.dueDayOfMonth}</p>
                </div>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
