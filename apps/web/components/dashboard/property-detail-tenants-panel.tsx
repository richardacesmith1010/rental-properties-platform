"use client";

import { MessageSquare, Users } from "lucide-react";
import type { TenantActivityEntry } from "@/app/actions/tenant-activity";
import type { ActionState } from "@/app/actions";
import type { LeaseListItem } from "@/lib/portfolio";
import type { PropertyDetailData } from "@/lib/property-detail";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TenantActivityTimeline } from "@/components/dashboard/tenant-activity-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) =>
    character.toUpperCase()
  );
}

function leaseBadgeVariant(status: LeaseListItem["leaseStatus"]) {
  if (status === "active") return "success";
  if (status === "expiring_soon") return "warning";
  if (status === "expired" || status === "terminated") return "destructive";
  return "outline";
}

export function PropertyDetailTenantsPanel({
  data,
  activeTenantActivityId,
  onToggleTenantActivity,
  onOpenMessage,
  onCreateTenantActivity,
  onGetTenantActivityLog
}: {
  data: PropertyDetailData;
  activeTenantActivityId: string | null;
  onToggleTenantActivity: (leaseId: string) => void;
  onOpenMessage: (leaseId: string) => void;
  onCreateTenantActivity: StatefulAction;
  onGetTenantActivityLog: (
    tenantProfileId: string,
    propertyId: string
  ) => Promise<TenantActivityEntry[]>;
}) {
  const activeLeases = data.leases.filter((lease) => lease.active);
  const unitNumberById = new Map(
    data.units.map((unit) => [unit.id, unit.unitNumber])
  );

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Tenants</CardTitle>
      </CardHeader>
      <CardContent>
        {activeLeases.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active tenants"
            description="Active leases for this property will appear here."
          />
        ) : (
          <div className="space-y-4">
            {activeLeases.map((lease) => {
              const isActivityOpen = activeTenantActivityId === lease.id;

              return (
                <div
                  key={lease.id}
                  className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">
                          {lease.tenantName}
                        </p>
                        <Badge variant={leaseBadgeVariant(lease.leaseStatus)}>
                          {labelize(lease.leaseStatus)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Unit {unitNumberById.get(lease.unitId) ?? lease.unitLabel}
                      </p>
                      <p className="text-sm text-muted-foreground">{lease.tenantEmail}</p>
                      <p className="text-sm text-muted-foreground">
                        {lease.tenantPhone ?? "No phone number on file"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Lease dates: {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={isActivityOpen ? "default" : "outline"}
                        onClick={() => onToggleTenantActivity(lease.id)}
                        title={
                          isActivityOpen
                            ? "Hide this tenant activity timeline."
                            : "Show this tenant activity timeline."
                        }
                      >
                        View Activity
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenMessage(lease.id)}
                        title={`Open the message composer for ${lease.tenantName}.`}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Send Message
                      </Button>
                    </div>
                  </div>

                  {isActivityOpen ? (
                    <TenantActivityTimeline
                      tenantProfileId={lease.tenantProfileId}
                      propertyId={lease.propertyId}
                      unitId={lease.unitId}
                      leaseId={lease.id}
                      tenantName={lease.tenantName}
                      onLoadEntries={onGetTenantActivityLog}
                      onCreateActivity={onCreateTenantActivity}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
