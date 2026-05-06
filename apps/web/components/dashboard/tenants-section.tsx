"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Search, Users } from "lucide-react";
import { ComposeMessageModal } from "@/components/dashboard/compose-message-modal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TenantActivityTimeline } from "@/components/dashboard/tenant-activity-timeline";
import { DataRow } from "@/components/shared/data-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ActionState } from "@/app/actions";
import type { TenantActivityEntry } from "@/app/actions/tenant-activity";
import { pluralize } from "@/lib/format";
import type {
  LeaseListItem,
  PropertyListItem,
  TenantOption,
  UnitListItem
} from "@/lib/portfolio";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

type TenantActivityLoader = (
  tenantProfileId: string,
  propertyId: string
) => Promise<TenantActivityEntry[]>;

export interface TenantsSectionProps {
  tenants: TenantOption[];
  leases: LeaseListItem[];
  properties: PropertyListItem[];
  units: UnitListItem[];
  onSendMessage?: (tenantId: string) => void;
  onViewActivity?: (tenantId: string, propertyId: string) => void;
  onSendMessageToTenant?: StatefulAction;
  onCreateTenantActivity?: StatefulAction;
  onGetTenantActivityLog?: TenantActivityLoader;
}

interface TenantDirectoryRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  leaseLabels: string[];
  activeLeaseCount: number;
  primaryLease: LeaseListItem | null;
  searchText: string;
}

function sortLeases(left: LeaseListItem, right: LeaseListItem) {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  const propertyCompare = (left.propertyName ?? "").localeCompare(right.propertyName ?? "");
  if (propertyCompare !== 0) {
    return propertyCompare;
  }

  return left.unitLabel.localeCompare(right.unitLabel);
}

function formatLeaseLabel(
  lease: LeaseListItem,
  propertyNameById: Map<string, string>,
  unitById: Map<string, UnitListItem>
) {
  const propertyName =
    propertyNameById.get(lease.propertyId) ?? lease.propertyName ?? "Property";
  const unitNumber = unitById.get(lease.unitId)?.unitNumber;

  if (unitNumber) {
    return `${propertyName} — Unit ${unitNumber}`;
  }

  return lease.unitLabel.replace(" • ", " — ");
}

function buildTenantDirectoryRows(
  tenants: TenantOption[],
  leases: LeaseListItem[],
  properties: PropertyListItem[],
  units: UnitListItem[]
): TenantDirectoryRow[] {
  const propertyNameById = new Map(
    properties.map((property) => [property.id, property.name])
  );
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const tenantById = new Map<string, TenantOption>();

  for (const tenant of tenants) {
    if (!tenant.id) {
      continue;
    }

    const existing = tenantById.get(tenant.id);
    if (!existing) {
      tenantById.set(tenant.id, tenant);
      continue;
    }

    tenantById.set(tenant.id, {
      id: tenant.id,
      email: existing.email || tenant.email,
      fullName: existing.fullName || tenant.fullName,
      phone: existing.phone ?? tenant.phone ?? null,
      propertyIds: Array.from(new Set([...existing.propertyIds, ...tenant.propertyIds]))
    });
  }

  const leasesByTenantId = new Map<string, LeaseListItem[]>();
  for (const lease of leases) {
    if (!lease.tenantProfileId) {
      continue;
    }

    const existing = leasesByTenantId.get(lease.tenantProfileId) ?? [];
    existing.push(lease);
    leasesByTenantId.set(lease.tenantProfileId, existing);
  }

  return Array.from(leasesByTenantId.entries())
    .map(([tenantId, tenantLeases]) => {
      const sortedLeases = [...tenantLeases].sort(sortLeases);
      const tenant = tenantById.get(tenantId);
      const fallbackLease = sortedLeases[0];
      const activeLeaseCount = tenantLeases.filter((lease) => lease.active).length;
      const primaryLease =
        sortedLeases.find((lease) => lease.active) ?? fallbackLease ?? null;
      const leaseLabels = Array.from(
        new Set(
          sortedLeases.map((lease) =>
            formatLeaseLabel(lease, propertyNameById, unitById)
          )
        )
      );
      const fullName =
        tenant?.fullName?.trim() || fallbackLease?.tenantName || tenant?.email || "Tenant";
      const email =
        tenant?.email?.trim() || fallbackLease?.tenantEmail || "No email on file";
      const phone =
        tenant?.phone ??
        sortedLeases.find((lease) => lease.tenantPhone)?.tenantPhone ??
        null;

      return {
        id: tenantId,
        fullName,
        email,
        phone,
        leaseLabels,
        activeLeaseCount,
        primaryLease,
        searchText: `${fullName} ${email}`.toLowerCase()
      };
    })
    .sort((left, right) => {
      const nameCompare = left.fullName.localeCompare(right.fullName);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return left.email.localeCompare(right.email);
    });
}

export function TenantsSection({
  tenants,
  leases,
  properties,
  units,
  onSendMessage,
  onViewActivity,
  onSendMessageToTenant,
  onCreateTenantActivity,
  onGetTenantActivityLog
}: TenantsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [messageTenantId, setMessageTenantId] = useState<string | null>(null);

  const tenantRows = useMemo(
    () => buildTenantDirectoryRows(tenants, leases, properties, units),
    [leases, properties, tenants, units]
  );

  const visibleRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return tenantRows;
    }

    return tenantRows.filter((tenantRow) =>
      tenantRow.searchText.includes(normalizedQuery)
    );
  }, [searchQuery, tenantRows]);

  const messageTenant =
    messageTenantId === null
      ? null
      : tenantRows.find((tenantRow) => tenantRow.id === messageTenantId) ?? null;

  if (tenantRows.length === 0) {
    return (
      <Card id="tenants" className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Tenants (0)</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Users}
            title="No tenants yet"
            description="Invite a tenant from the Leases section."
            showDom={false}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="tenants" className="border border-border/50 shadow-sm">
      <CardHeader className="gap-3">
        <CardTitle className="text-xl font-semibold">
          Tenants ({tenantRows.length})
        </CardTitle>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
            placeholder="Search by name or email..."
            title="Search tenants by name or email."
            aria-label="Search by name or email"
          />
        </div>
      </CardHeader>
      <CardContent>
        {visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No tenants match that search.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleRows.map((tenantRow, index) => {
              const isActivityOpen = activeTenantId === tenantRow.id;
              const hasActiveLease = tenantRow.activeLeaseCount > 0;
              const canViewActivity = Boolean(
                tenantRow.primaryLease &&
                  (onViewActivity ||
                    (onCreateTenantActivity && onGetTenantActivityLog))
              );
              const canSendMessage = Boolean(
                tenantRow.primaryLease &&
                  (onSendMessage || onSendMessageToTenant)
              );

              return (
                <div key={tenantRow.id} className="space-y-3">
                  <DataRow last={index === visibleRows.length - 1}>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-foreground">
                            {tenantRow.fullName}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {tenantRow.email}
                            {tenantRow.phone ? ` • ${tenantRow.phone}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={hasActiveLease ? "success" : "outline"}>
                            {hasActiveLease ? "Active" : "No active lease"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {pluralize(tenantRow.activeLeaseCount, "active lease")}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        {tenantRow.leaseLabels.map((leaseLabel) => (
                          <p key={leaseLabel}>{leaseLabel}</p>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={isActivityOpen ? "default" : "outline"}
                          disabled={!canViewActivity}
                          onClick={() => {
                            if (!tenantRow.primaryLease) {
                              return;
                            }

                            onViewActivity?.(
                              tenantRow.id,
                              tenantRow.primaryLease.propertyId
                            );

                            if (onCreateTenantActivity && onGetTenantActivityLog) {
                              setActiveTenantId((current) =>
                                current === tenantRow.id ? null : tenantRow.id
                              );
                            }
                          }}
                          title={`Open activity for ${tenantRow.fullName}.`}
                        >
                          View Activity
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canSendMessage}
                          onClick={() => {
                            onSendMessage?.(tenantRow.id);

                            if (tenantRow.primaryLease && onSendMessageToTenant) {
                              setMessageTenantId(tenantRow.id);
                            }
                          }}
                          title={`Open the message composer for ${tenantRow.fullName}.`}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Send Message
                        </Button>
                      </div>
                    </div>
                  </DataRow>

                  {isActivityOpen &&
                  tenantRow.primaryLease &&
                  onCreateTenantActivity &&
                  onGetTenantActivityLog ? (
                    <TenantActivityTimeline
                      tenantProfileId={tenantRow.id}
                      propertyId={tenantRow.primaryLease.propertyId}
                      unitId={tenantRow.primaryLease.unitId}
                      leaseId={tenantRow.primaryLease.id}
                      tenantName={tenantRow.fullName}
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

      {messageTenant?.primaryLease && onSendMessageToTenant ? (
        <ComposeMessageModal
          open
          onClose={() => setMessageTenantId(null)}
          recipientName={messageTenant.fullName}
          recipientProfileId={messageTenant.id}
          propertyId={messageTenant.primaryLease.propertyId}
          propertyName={
            messageTenant.primaryLease.propertyName ??
            properties.find(
              (property) => property.id === messageTenant.primaryLease?.propertyId
            )?.name ??
            "Property"
          }
          prefilledSubject={`Message about ${
            messageTenant.primaryLease.propertyName ?? "your lease"
          }`}
          onSend={onSendMessageToTenant}
        />
      ) : null}
    </Card>
  );
}
