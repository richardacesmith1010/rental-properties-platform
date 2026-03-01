import {
  createCheckoutForCharge,
  createMaintenanceTicket,
  signOut,
  markNotificationRead,
  signDocumentPacket
} from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { getTenantMaintenanceData } from "@/lib/maintenance";
import { getTenantDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarNav, MobileTopBar, type NavItem } from "@/components/dashboard/sidebar-nav";
import { KpiCard } from "@/components/shared/kpi-card";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketForm } from "@/components/dashboard/ticket-form";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import { TenantDocumentsSection } from "@/components/dashboard/tenant-documents-section";
import { NotificationsSection } from "@/components/dashboard/notifications-section";
import {
  Bell,
  CreditCard,
  FileSignature,
  LayoutDashboard,
  Receipt,
  Wrench
} from "lucide-react";

export const dynamic = "force-dynamic";

const tenantNavItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "charges", label: "Charges", icon: Receipt },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "documents", label: "Documents", icon: FileSignature },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

export default async function TenantPage() {
  const { user } = await requireRole(["tenant"]);
  const capabilities = await getFeatureCapabilities();

  const [paymentData, maintenanceData, documentsData, notifications] = await Promise.all([
    getTenantPaymentData(user.id),
    getTenantMaintenanceData(user.id),
    capabilities.documentsEnabled
      ? getTenantDocumentsData(user.id)
      : Promise.resolve({ packets: [] }),
    capabilities.notificationsEnabled
      ? getNotificationsForUser(user.id)
      : Promise.resolve([])
  ]);

  const outstandingCents = paymentData.charges.reduce(
    (sum, charge) => sum + charge.amountCents,
    0
  );
  const lateChargeCount = paymentData.charges.filter((charge) => charge.status === "late").length;
  const openTicketCount = maintenanceData.tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const pendingDocumentCount = documentsData.packets.filter(
    (packet) => packet.signerStatus !== "signed"
  ).length;
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar userEmail={user.email ?? "unknown"} role="tenant" onSignOut={signOut} />

      <SidebarNav
        userEmail={user.email ?? "unknown"}
        occupancy={0}
        activeLeaseCount={0}
        role="tenant"
        onSignOut={signOut}
        items={tenantNavItems}
        snapshot={{
          label: "Tenant Snapshot",
          value: dollars(outstandingCents),
          note: `${paymentData.charges.length} open charge${paymentData.charges.length === 1 ? "" : "s"}`
        }}
      />

      <main className="relative flex-1 lg:ml-[260px]">
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Tenant Workspace</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Manage rent, tickets, documents, and alerts in one place.
            </p>
          </div>
          <Badge className="self-start border border-indigo-200 bg-indigo-50 text-indigo-700 capitalize">
            tenant
          </Badge>
        </div>

        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Outstanding Rent"
              value={dollars(outstandingCents)}
              badge={`${paymentData.charges.length} open charge${paymentData.charges.length === 1 ? "" : "s"}`}
              gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
              alert={outstandingCents > 0}
            />
            <KpiCard
              label="Late Charges"
              value={lateChargeCount.toString()}
              badge={lateChargeCount > 0 ? "Needs payment" : "All current"}
              gradient="linear-gradient(135deg, #f59e0b, #ef4444)"
              alert={lateChargeCount > 0}
            />
            <KpiCard
              label="Open Tickets"
              value={openTicketCount.toString()}
              badge={`${maintenanceData.tickets.length} total`}
              gradient="linear-gradient(135deg, #06b6d4, #3b82f6)"
            />
            <KpiCard
              label="Pending Signatures"
              value={pendingDocumentCount.toString()}
              badge={`${unreadNotificationCount} unread alerts`}
              gradient="linear-gradient(135deg, #10b981, #14b8a6)"
            />
          </div>

          <Card id="charges">
            <CardHeader>
              <CardTitle>Outstanding Rent Charges</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentData.charges.length === 0 ? (
                <EmptyState message="You currently have no pending rent charges." />
              ) : (
                <div>
                  {paymentData.charges.map((charge, i) => (
                    <DataRow key={charge.id} last={i === paymentData.charges.length - 1}>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {charge.propertyLabel}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">Due {charge.dueDate}</p>
                        <Badge
                          variant={charge.status === "late" ? "destructive" : "warning"}
                          className="mt-1"
                        >
                          {charge.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-zinc-900">
                          {dollars(charge.amountCents)}
                        </p>
                        <form action={createCheckoutForCharge} className="mt-2">
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <SubmitButton size="sm">
                            <CreditCard className="mr-2 h-3.5 w-3.5" />
                            Pay with Card
                          </SubmitButton>
                        </form>
                      </div>
                    </DataRow>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div id="maintenance">
            <TicketForm
              units={maintenanceData.units}
              onCreateTicket={createMaintenanceTicket}
            />
          </div>

          <MaintenanceSection
            tickets={maintenanceData.tickets}
            showControls={false}
            photoWorkflowEnabled={capabilities.photoWorkflowEnabled}
            photoWorkflowWarning={capabilities.warnings.photoWorkflow}
          />

          <div id="documents">
            <TenantDocumentsSection
              packets={documentsData.packets}
              onSignPacket={signDocumentPacket}
              isFeatureReady={capabilities.documentsEnabled}
              featureWarning={capabilities.warnings.documents}
              assetAccessEnabled={capabilities.documentAssetAccessEnabled}
              assetAccessWarning={
                capabilities.documentsEnabled && !capabilities.documentAssetAccessEnabled
                  ? "Document records are available, but secure file links are not configured yet."
                  : null
              }
            />
          </div>

          {capabilities.notificationsEnabled ? (
            <NotificationsSection
              notifications={notifications}
              onMarkRead={markNotificationRead}
            />
          ) : (
            <FeatureWarning
              title="Notifications Unavailable"
              message={
                capabilities.warnings.notifications ??
                "Notifications are not ready yet. Complete setup and reload."
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
