import type { ManagerDashboardData } from "@/lib/manager-dashboard";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/kpi-card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SidebarNav, MobileTopBar, type NavItem } from "./sidebar-nav";
import { MaintenanceSection } from "./maintenance-section";
import {
  LayoutDashboard,
  Building2,
  Wrench,
  Receipt,
} from "lucide-react";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface ManagerDashboardProps {
  data: ManagerDashboardData;
  vendors: VendorDTO[];
  capabilities?: FeatureCapabilitiesDTO;
  userEmail: string;
  onSignOut: FormAction;
  onUpdateTicketStatus: StatefulAction;
  onAssignVendor: StatefulAction;
  onUploadPhoto: StatefulAction;
}

const managerNavItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "rent-status", label: "Rent Status", icon: Receipt },
];

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export function ManagerDashboard({
  data,
  vendors,
  capabilities,
  userEmail,
  onSignOut,
  onUpdateTicketStatus,
  onAssignVendor,
  onUploadPhoto
}: ManagerDashboardProps) {
  const safeCapabilities: FeatureCapabilitiesDTO = capabilities ?? {
    documentsEnabled: true,
    documentAssetAccessEnabled: true,
    notificationsEnabled: true,
    vendorWorkflowEnabled: true,
    photoWorkflowEnabled: true,
    ownershipEnabled: true,
    warnings: {}
  };

  const occupancy =
    data.kpis.totalUnits > 0
      ? Math.round((data.kpis.occupiedUnits / data.kpis.totalUnits) * 100)
      : 0;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar */}
      <MobileTopBar userEmail={userEmail} role="manager" onSignOut={onSignOut} />

      {/* Desktop sidebar */}
      <SidebarNav
        userEmail={userEmail}
        occupancy={occupancy}
        activeLeaseCount={data.kpis.activeLeaseCount}
        role="manager"
        onSignOut={onSignOut}
        items={managerNavItems}
      />

      {/* Main content */}
      <main className="flex-1 lg:ml-[260px]">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Manager Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge className="self-start capitalize">manager</Badge>
        </div>

        {/* Content sections */}
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Assigned Properties"
              value={data.kpis.assignedPropertyCount.toString()}
              badge={`${data.kpis.assignedPropertyCount} managed`}
              gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
            />
            <KpiCard
              label="Occupancy"
              value={`${occupancy}%`}
              badge={`${data.kpis.occupiedUnits}/${data.kpis.totalUnits} units`}
              gradient="linear-gradient(135deg, #10b981, #34d399)"
            />
            <KpiCard
              label="Open Maintenance"
              value={data.kpis.openMaintenanceCount.toString()}
              badge={
                data.kpis.highPriorityMaintenanceCount > 0
                  ? `${data.kpis.highPriorityMaintenanceCount} high priority`
                  : `${data.kpis.openMaintenanceCount} open`
              }
              gradient="linear-gradient(135deg, #f59e0b, #fbbf24)"
              alert={data.kpis.highPriorityMaintenanceCount > 0}
            />
            <KpiCard
              label="Late Rent"
              value={dollars(data.kpis.lateRentCents)}
              badge={
                data.kpis.lateAccountCount > 0
                  ? `${data.kpis.lateAccountCount} account${data.kpis.lateAccountCount === 1 ? "" : "s"}`
                  : "All current"
              }
              gradient="linear-gradient(135deg, #f43f5e, #fb7185)"
              alert={data.kpis.lateAccountCount > 0}
            />
          </div>

          {/* Properties */}
          <Card id="properties">
            <CardHeader>
              <CardTitle>Assigned Properties</CardTitle>
            </CardHeader>
            <CardContent>
              {data.properties.length === 0 ? (
                <EmptyState message="No properties assigned yet." />
              ) : (
                <div>
                  {data.properties.map((property, i) => (
                    <DataRow
                      key={property.id}
                      last={i === data.properties.length - 1}
                    >
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {property.name}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {property.city}, {property.state}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {property.unitCount} unit
                        {property.unitCount === 1 ? "" : "s"}
                      </Badge>
                    </DataRow>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maintenance Tickets */}
          <MaintenanceSection
            tickets={data.tickets}
            showControls={true}
            onUpdateStatus={onUpdateTicketStatus}
            vendors={vendors}
            onAssignVendor={safeCapabilities.vendorWorkflowEnabled ? onAssignVendor : undefined}
            onUploadPhoto={safeCapabilities.photoWorkflowEnabled ? onUploadPhoto : undefined}
            vendorWorkflowEnabled={safeCapabilities.vendorWorkflowEnabled}
            photoWorkflowEnabled={safeCapabilities.photoWorkflowEnabled}
            vendorWorkflowWarning={safeCapabilities.warnings.vendorWorkflow}
            photoWorkflowWarning={safeCapabilities.warnings.photoWorkflow}
          />

          {/* Rent Status */}
          <Card id="rent-status">
            <CardHeader>
              <CardTitle>Rent Charges</CardTitle>
            </CardHeader>
            <CardContent>
              {data.charges.length === 0 ? (
                <EmptyState message="No pending or late rent charges." />
              ) : (
                <div>
                  {data.charges.map((charge, i) => (
                    <DataRow
                      key={charge.id}
                      last={i === data.charges.length - 1}
                    >
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {charge.leaseId.slice(0, 8)}...
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Due {charge.dueDate}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-zinc-900">
                          {dollars(charge.amountCents)}
                        </p>
                        <Badge
                          variant={
                            charge.status === "late" ? "destructive" : "warning"
                          }
                          className="mt-0.5"
                        >
                          {charge.status.toUpperCase()}
                        </Badge>
                      </div>
                    </DataRow>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
