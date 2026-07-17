import { ClipboardList } from "lucide-react";
import type { PropertyDetailData } from "@/lib/property-detail";
import { formatCurrency, formatDateTime, formatUnitLabel } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const activityTypeLabel: Record<
  PropertyDetailData["activity"][number]["activityType"],
  string
> = {
  infraction: "Infraction",
  notice: "Notice Sent",
  warning: "Warning",
  note: "Note"
};

export function PropertyDetailOverviewPanel({
  data
}: {
  data: PropertyDetailData;
}) {
  const activeLeases = data.leases.filter((lease) => lease.active);
  const occupiedUnits = data.units.filter((unit) => unit.occupied).length;
  const vacancyCount = Math.max(data.units.length - occupiedUnits, 0);
  const monthlyRevenueCents = activeLeases.reduce(
    (sum, lease) => sum + lease.monthlyRentCents,
    0
  );
  const outstandingBalanceCents = data.charges
    .filter((charge) => charge.status === "pending" || charge.status === "late")
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const openMaintenanceCount = data.maintenance.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[22px] font-[640] tracking-[-0.02em]">
            {data.property.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{data.property.addressLine1}</p>
            <p>
              {data.property.city}, {data.property.state} {data.property.postalCode}
            </p>
            <p>Owner account: {data.property.ownerAccountName}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Monthly revenue
              </p>
              <p className="tabular-nums mt-3 text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]">
                {formatCurrency(monthlyRevenueCents)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Outstanding balance
              </p>
              <p className="tabular-nums mt-3 text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]">
                {formatCurrency(outstandingBalanceCents)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Units
              </p>
              <p className="tabular-nums mt-3 text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]">
                {data.units.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {occupiedUnits} occupied, {vacancyCount} vacant
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Open maintenance
              </p>
              <p className="tabular-nums mt-3 text-[25px] font-[660] tracking-[-0.025em] text-[var(--ink)]">
                {openMaintenanceCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                open maintenance, {data.activity.length} recent activity entries
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[22px] font-[640] tracking-[-0.02em]">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.activity.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No activity yet"
              description="Tenant notices, warnings, and notes for this property will appear here."
            />
          ) : (
            <div className="space-y-3">
              {data.activity.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/60 bg-card/70 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {activityTypeLabel[entry.activityType]}
                        </Badge>
                        <p className="font-medium text-foreground">{entry.title}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {entry.tenantName}
                        {entry.unitNumber ? ` • ${formatUnitLabel(entry.unitNumber)}` : ""}
                      </p>
                      {entry.description ? (
                        <p className="text-sm text-muted-foreground">
                          {entry.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right">
                      <p>Logged by {entry.authorName}</p>
                      <p>{formatDateTime(entry.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
