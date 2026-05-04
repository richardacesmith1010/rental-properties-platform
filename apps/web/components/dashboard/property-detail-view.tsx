"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, FileText, Receipt, Users, Wrench } from "lucide-react";
import type { TenantActivityEntry } from "@/app/actions/tenant-activity";
import type { ActionState } from "@/app/actions";
import type { PropertyDetailData } from "@/lib/property-detail";
import { pluralize } from "@/lib/format";
import { ComposeMessageModal } from "@/components/dashboard/compose-message-modal";
import {
  PropertyDetailDocumentsPanel,
  PropertyDetailMaintenancePanel,
  PropertyDetailPaymentsPanel
} from "@/components/dashboard/property-detail-detail-panels";
import { PropertyDetailOverviewPanel } from "@/components/dashboard/property-detail-overview-panel";
import { PropertyDetailTenantsPanel } from "@/components/dashboard/property-detail-tenants-panel";
import { Button } from "@/components/ui/button";

type TabId = "overview" | "payments" | "maintenance" | "documents" | "tenants";
type PaymentFilter = "all" | "pending" | "paid" | "late";
type MaintenanceFilter = "active" | "completed" | "all";
type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PropertyDetailViewProps {
  data: PropertyDetailData;
  role: "owner" | "manager";
  onCreateTenantActivity: StatefulAction;
  onGetTenantActivityLog: (
    tenantProfileId: string,
    propertyId: string
  ) => Promise<TenantActivityEntry[]>;
  onSendMessageToTenant: StatefulAction;
  onAddTicketComment: StatefulAction;
  onUpdateTicketStatus: StatefulAction;
}

const tabs: Array<{ id: TabId; label: string; icon: typeof Building2 }> = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "payments", label: "Payments", icon: Receipt },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "tenants", label: "Tenants", icon: Users }
];

export function PropertyDetailView({
  data,
  role,
  onCreateTenantActivity,
  onGetTenantActivityLog,
  onSendMessageToTenant,
  onAddTicketComment,
  onUpdateTicketStatus
}: PropertyDetailViewProps) {
  const dashboardHref = role === "owner" ? "/owner" : "/manager";
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [maintenanceFilter, setMaintenanceFilter] =
    useState<MaintenanceFilter>("active");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [activeTenantActivityId, setActiveTenantActivityId] = useState<
    string | null
  >(null);
  const [activeMessageLeaseId, setActiveMessageLeaseId] = useState<string | null>(
    null
  );

  const activeLeases = useMemo(
    () => data.leases.filter((lease) => lease.active),
    [data.leases]
  );
  const messageLease =
    activeMessageLeaseId === null
      ? null
      : activeLeases.find((lease) => lease.id === activeMessageLeaseId) ?? null;

  return (
    <main id="main-content" className="app-surface min-h-screen px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Button asChild variant="outline" size="sm">
              <Link href={dashboardHref} title="Return to the dashboard.">
                Back to Dashboard
              </Link>
            </Button>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Property Details
              </p>
              <h1 className="mt-1 text-3xl font-bold text-foreground">
                {data.property.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.property.addressLine1}, {data.property.city}, {data.property.state}{" "}
                {data.property.postalCode}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-muted-foreground shadow-sm">
            {pluralize(data.units.length, "unit")} • {pluralize(activeLeases.length, "active lease")} •{" "}
            {pluralize(data.charges.length, "charge")}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={activeTab === tab.id ? "default" : "outline"}
                onClick={() => setActiveTab(tab.id)}
                title={`Open the ${tab.label.toLowerCase()} tab.`}
              >
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {activeTab === "overview" ? <PropertyDetailOverviewPanel data={data} /> : null}
        {activeTab === "payments" ? (
          <PropertyDetailPaymentsPanel
            charges={data.charges}
            filter={paymentFilter}
            onFilterChange={setPaymentFilter}
          />
        ) : null}
        {activeTab === "maintenance" ? (
          <PropertyDetailMaintenancePanel
            data={data}
            role={role}
            filter={maintenanceFilter}
            expandedTicketId={expandedTicketId}
            onFilterChange={setMaintenanceFilter}
            onToggleTicket={(ticketId) =>
              setExpandedTicketId((current) => (current === ticketId ? null : ticketId))
            }
            onAddTicketComment={onAddTicketComment}
            onUpdateTicketStatus={onUpdateTicketStatus}
          />
        ) : null}
        {activeTab === "documents" ? (
          <PropertyDetailDocumentsPanel data={data} role={role} />
        ) : null}
        {activeTab === "tenants" ? (
          <PropertyDetailTenantsPanel
            data={data}
            activeTenantActivityId={activeTenantActivityId}
            onToggleTenantActivity={(leaseId) =>
              setActiveTenantActivityId((current) =>
                current === leaseId ? null : leaseId
              )
            }
            onOpenMessage={setActiveMessageLeaseId}
            onCreateTenantActivity={onCreateTenantActivity}
            onGetTenantActivityLog={onGetTenantActivityLog}
          />
        ) : null}
      </div>

      {messageLease ? (
        <ComposeMessageModal
          open
          onClose={() => setActiveMessageLeaseId(null)}
          recipientName={messageLease.tenantName}
          recipientProfileId={messageLease.tenantProfileId}
          propertyId={data.property.id}
          propertyName={data.property.name}
          prefilledSubject={`Message about ${data.property.name}`}
          onSend={onSendMessageToTenant}
        />
      ) : null}
    </main>
  );
}
