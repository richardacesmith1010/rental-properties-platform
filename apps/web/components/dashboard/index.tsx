import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
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
  onResendInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onCreateDocumentTemplate?: StatefulAction;
  onDeleteDocumentTemplate?: StatefulAction;
  onCreateDocumentPacket?: StatefulAction;
  onSendDocumentPacket?: StatefulAction;
  onCreateVendor?: StatefulAction;
  onAssignVendor?: StatefulAction;
  onUploadMaintenancePhoto?: StatefulAction;
}

export function Dashboard({
  data,
  portfolio,
  tickets,
  invitations,
  notifications,
  documents,
  vendors,
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
  onResendInvite,
  onMarkNotificationRead,
  onCreateDocumentTemplate,
  onDeleteDocumentTemplate,
  onCreateDocumentPacket,
  onSendDocumentPacket,
  onCreateVendor,
  onAssignVendor,
  onUploadMaintenancePhoto
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
  const occupancy =
    data.kpis.totalUnits > 0
      ? Math.round((data.kpis.occupiedUnits / data.kpis.totalUnits) * 100)
      : 0;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
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
      <main className="flex-1 lg:ml-[260px]">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge className="self-start capitalize">{data.profileRole}</Badge>
        </div>

        {/* Content sections */}
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {generatedMessage && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
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
            onAssignVendor={onAssignVendor}
            onUploadPhoto={onUploadMaintenancePhoto}
          />

          {onMarkNotificationRead && (
            <NotificationsSection
              notifications={safeNotifications}
              onMarkRead={onMarkNotificationRead}
            />
          )}

          {onInviteTenant && onInviteManager && onResendInvite && (
            <InvitationsSection
              properties={safePortfolio.properties}
              invitations={invitations ?? []}
              onInviteTenant={onInviteTenant}
              onInviteManager={onInviteManager}
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
                onCreateTemplate={onCreateDocumentTemplate}
                onDeleteTemplate={onDeleteDocumentTemplate}
                onCreatePacket={onCreateDocumentPacket}
                onSendPacket={onSendDocumentPacket}
              />
            )}

          {onCreateVendor && (
            <VendorsSection
              vendors={safeVendors}
              onCreateVendor={onCreateVendor}
            />
          )}

          <OperationsSection
            portfolio={safePortfolio}
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
