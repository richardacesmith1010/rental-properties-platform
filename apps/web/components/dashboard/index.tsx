import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { SidebarNav, MobileTopBar } from "./sidebar-nav";
import { KpiGrid } from "./kpi-grid";
import { ChargesSection } from "./charges-section";
import { PaymentsSection } from "./payments-section";
import { MaintenanceSection } from "./maintenance-section";
import { InvitationsSection } from "./invitations-section";
import { OperationsSection } from "./operations-section";
import { PortfolioSection } from "./portfolio-section";
import { LeasesSection } from "./leases-section";
import { NotificationsSection } from "./notifications-section";
import { DocumentsSection } from "./documents-section";
import { VendorsSection } from "./vendors-section";
import { OwnershipSection } from "./ownership-section";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DashboardProps {
  data: DashboardData;
  portfolio?: PortfolioData;
  tickets?: MaintenanceTicket[];
  invitations?: InvitationListItem[];
  notifications?: NotificationDTO[];
  documents?: OwnerDocumentsData;
  vendors?: VendorDTO[];
  capabilities?: FeatureCapabilitiesDTO;
  ownershipAccounts?: OwnershipAccountDTO[];
  generatedMessage?: string | null;
  userEmail: string;
  onGenerateChargesHref?: string;
  onSignOut: FormAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onPayCharge: FormAction;
  onUpdateTicketStatus?: StatefulAction;
  onInviteTenant?: StatefulAction;
  onInviteManager?: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onCreateDocumentTemplate?: StatefulAction;
  onDeleteDocumentTemplate?: StatefulAction;
  onCreateDocumentPacket?: StatefulAction;
  onSendDocumentPacket?: StatefulAction;
  onCreateVendor?: StatefulAction;
  onAssignVendor?: StatefulAction;
  onUploadMaintenancePhoto?: StatefulAction;
  onCreateOwnershipAccount?: StatefulAction;
  onLinkPropertyToOwnershipAccount?: StatefulAction;
}

export function Dashboard({
  data,
  portfolio,
  tickets,
  invitations,
  notifications,
  documents,
  vendors,
  capabilities,
  ownershipAccounts,
  generatedMessage,
  userEmail,
  onGenerateChargesHref,
  onSignOut,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onPayCharge,
  onUpdateTicketStatus,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onMarkNotificationRead,
  onCreateDocumentTemplate,
  onDeleteDocumentTemplate,
  onCreateDocumentPacket,
  onSendDocumentPacket,
  onCreateVendor,
  onAssignVendor,
  onUploadMaintenancePhoto,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount
}: DashboardProps) {
  const safePortfolio: PortfolioData = portfolio ?? {
    properties: [],
    units: [],
    leases: [],
    tenants: [],
  };
  const safeDocuments: OwnerDocumentsData = documents ?? {
    templates: [],
    packets: []
  };
  const safeNotifications: NotificationDTO[] = notifications ?? [];
  const safeVendors: VendorDTO[] = vendors ?? [];
  const safeOwnershipAccounts: OwnershipAccountDTO[] = ownershipAccounts ?? [];
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
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar */}
      <MobileTopBar userEmail={userEmail} role={data.profileRole} onSignOut={onSignOut} />

      {/* Desktop sidebar */}
      <SidebarNav
        userEmail={userEmail}
        occupancy={occupancy}
        activeLeaseCount={data.kpis.activeLeaseCount}
        role={data.profileRole}
        onSignOut={onSignOut}
      />

      {/* Main content */}
      <main className="relative flex-1 lg:ml-[260px]">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Operations Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge className="self-start border border-indigo-200 bg-indigo-50 text-indigo-700 capitalize">
            {data.profileRole}
          </Badge>
        </div>

        {/* Content sections */}
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {generatedMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              {generatedMessage}
            </div>
          )}

          <KpiGrid
            monthlyGrossRentCents={data.kpis.monthlyGrossRentCents}
            occupancy={occupancy}
            occupiedUnits={data.kpis.occupiedUnits}
            totalUnits={data.kpis.totalUnits}
            activeLeaseCount={data.kpis.activeLeaseCount}
            openMaintenanceCount={data.kpis.openMaintenanceCount}
            highPriorityMaintenanceCount={data.kpis.highPriorityMaintenanceCount}
            lateRentCents={data.kpis.lateRentCents}
            lateAccountCount={data.kpis.lateAccountCount}
          />

          <ChargesSection
            charges={data.charges}
            onPayCharge={onPayCharge}
            onGenerateChargesHref={onGenerateChargesHref}
          />

          <PaymentsSection payments={data.recentPayments} />

          <MaintenanceSection
            tickets={tickets ?? []}
            showControls={!!onUpdateTicketStatus}
            onUpdateStatus={onUpdateTicketStatus}
            vendors={safeVendors}
            onAssignVendor={safeCapabilities.vendorWorkflowEnabled ? onAssignVendor : undefined}
            onUploadPhoto={safeCapabilities.photoWorkflowEnabled ? onUploadMaintenancePhoto : undefined}
            vendorWorkflowEnabled={safeCapabilities.vendorWorkflowEnabled}
            photoWorkflowEnabled={safeCapabilities.photoWorkflowEnabled}
            vendorWorkflowWarning={safeCapabilities.warnings.vendorWorkflow}
            photoWorkflowWarning={safeCapabilities.warnings.photoWorkflow}
          />

          {onMarkNotificationRead && (
            safeCapabilities.notificationsEnabled ? (
              <NotificationsSection
                notifications={safeNotifications}
                onMarkRead={onMarkNotificationRead}
              />
            ) : (
              <FeatureWarning
                title="Notifications Unavailable"
                message={
                  safeCapabilities.warnings.notifications ??
                  "Notifications are not ready yet. Complete setup and reload."
                }
              />
            )
          )}

          {onCreateOwnershipAccount && onLinkPropertyToOwnershipAccount && (
            safeCapabilities.ownershipEnabled ? (
              <OwnershipSection
                accounts={safeOwnershipAccounts}
                properties={safePortfolio.properties.map((property) => ({
                  id: property.id,
                  name: property.name,
                  ownerAccountName: property.ownerAccountName
                }))}
                onCreateOwnershipAccount={onCreateOwnershipAccount}
                onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount}
              />
            ) : (
              <FeatureWarning
                title="Ownership Accounts Unavailable"
                message={
                  safeCapabilities.warnings.ownership ??
                  "LLC/shared ownership is not ready yet. Complete Phase 9 setup and reload."
                }
              />
            )
          )}

          {onInviteTenant && onInviteManager && onResendInvite && (
            <InvitationsSection
              ownershipAccounts={safeOwnershipAccounts.map((account) => ({
                id: account.id,
                displayName: account.displayName
              }))}
              properties={safePortfolio.properties}
              invitations={invitations ?? []}
              onInviteTenant={onInviteTenant}
              onInviteManager={onInviteManager}
              onInviteOwner={safeCapabilities.ownershipEnabled ? onInviteOwner : undefined}
              onResendInvite={onResendInvite}
            />
          )}

          {onCreateDocumentTemplate &&
            onDeleteDocumentTemplate &&
            onCreateDocumentPacket &&
            onSendDocumentPacket && (
              <DocumentsSection
                templates={safeDocuments.templates}
                packets={safeDocuments.packets}
                leases={safePortfolio.leases}
                ownershipAccounts={safeOwnershipAccounts}
                onCreateTemplate={onCreateDocumentTemplate}
                onDeleteTemplate={onDeleteDocumentTemplate}
                onCreatePacket={onCreateDocumentPacket}
                onSendPacket={onSendDocumentPacket}
                isFeatureReady={safeCapabilities.documentsEnabled}
                featureWarning={safeCapabilities.warnings.documents}
                assetAccessEnabled={safeCapabilities.documentAssetAccessEnabled}
                assetAccessWarning={
                  safeCapabilities.documentsEnabled && !safeCapabilities.documentAssetAccessEnabled
                    ? "Document packet records are available, but file storage access is not configured yet."
                    : null
                }
              />
            )}

          {onCreateVendor && (
            safeCapabilities.vendorWorkflowEnabled ? (
              <VendorsSection
                vendors={safeVendors}
                ownershipAccounts={safeOwnershipAccounts}
                onCreateVendor={onCreateVendor}
              />
            ) : (
              <FeatureWarning
                title="Vendors Unavailable"
                message={
                  safeCapabilities.warnings.vendorWorkflow ??
                  "Vendor workflows are not ready yet. Complete setup and reload."
                }
              />
            )
          )}

          <OperationsSection
            portfolio={safePortfolio}
            ownershipAccounts={safeOwnershipAccounts}
            onCreateProperty={onCreateProperty}
            onCreateUnit={onCreateUnit}
            onCreateLease={onCreateLease}
          />

          <PortfolioSection properties={safePortfolio.properties} />

          <LeasesSection leases={safePortfolio.leases} />
        </div>
      </main>
    </div>
  );
}
