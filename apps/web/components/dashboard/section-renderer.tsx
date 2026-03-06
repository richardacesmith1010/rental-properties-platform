import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import type { ActionState } from "@/app/actions";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { KpiGrid } from "./kpi-grid";
import { ChargesSection } from "./charges-section";
import { PaymentsSection } from "./payments-section";
import { MaintenanceSection } from "./maintenance-section";
import { InvitationsSection } from "./invitations-section";
import { OperationsSection } from "./operations-section";
import { PortfolioSection } from "./portfolio-section";
import { UnitsSection } from "./units-section";
import { LeasesSection } from "./leases-section";
import { NotificationsSection } from "./notifications-section";
import { DocumentsSection } from "./documents-section";
import { VendorsSection } from "./vendors-section";
import { ExpensesSection } from "./expenses-section";
import { OwnershipSection } from "./ownership-section";
import { LeasingHubSection } from "./leasing-hub-section";
import { InboxSection } from "./inbox-section";
import { AutomationTemplatesSection } from "./automation-templates-section";
import { ApplicationsSection } from "./applications-section";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface SectionRendererProps {
  activeSection: string;
  occupancy: number;
  data: DashboardData;
  canManagePortfolio: boolean;
  safePortfolio: PortfolioData;
  tickets: MaintenanceTicket[];
  invitations: InvitationListItem[];
  safeNotifications: NotificationDTO[];
  safeInboxThreads: InboxThreadDTO[];
  safeDocuments: OwnerDocumentsData;
  safeAutomationTemplates: AutomationTemplateDTO[];
  safeAutomationRules: AutomationRuleDTO[];
  safeListings: RentalListingDTO[];
  safeApplications: ApplicationDTO[];
  safeVendors: VendorDTO[];
  safeExpenses: ExpenseDashboardData;
  safeOwnershipAccounts: OwnershipAccountDTO[];
  safeCapabilities: FeatureCapabilitiesDTO;
  sortedVendors: VendorDTO[];
  hasLeasingSection: boolean;
  hasApplicationsSection: boolean;
  hasInboxSection: boolean;
  hasAutomationsSection: boolean;
  hasNotificationsSection: boolean;
  hasOwnershipSection: boolean;
  hasInvitationsSection: boolean;
  hasDocumentsSection: boolean;
  hasVendorsSection: boolean;
  hasExpensesSection: boolean;
  applicationCount?: number;
  approvedApplicationCount?: number;
  onGenerateChargesHref?: string;
  onPayCharge: FormAction;
  onUpdateTicketStatus?: StatefulAction;
  onInviteTenant?: StatefulAction;
  onInviteManager?: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onCreateInboxThread?: StatefulAction;
  onSendInboxMessage?: StatefulAction;
  onEnableAutomation?: StatefulAction;
  onDisableAutomation?: StatefulAction;
  onCreateRentalListing?: StatefulAction;
  onUpdateListingStatus?: StatefulAction;
  onCreateApplication?: StatefulAction;
  onReviewApplication?: StatefulAction;
  onAddApplicationNote?: StatefulAction;
  onRecordScreeningScore?: StatefulAction;
  onCreateDocumentTemplate?: StatefulAction;
  onDeleteDocumentTemplate?: StatefulAction;
  onCreateDocumentPacket?: StatefulAction;
  onSendDocumentPacket?: StatefulAction;
  onUploadPropertyFile?: StatefulAction;
  onDeletePropertyFile?: StatefulAction;
  onUpdateFileVisibility?: StatefulAction;
  onCreateVendor?: StatefulAction;
  onUpdateVendor?: StatefulAction;
  onAssignVendor?: StatefulAction;
  onUploadMaintenancePhoto?: StatefulAction;
  onCreateExpense?: StatefulAction;
  onUpdateExpense?: StatefulAction;
  onDeleteExpense?: StatefulAction;
  onCreateOwnershipAccount?: StatefulAction;
  onLinkPropertyToOwnershipAccount?: StatefulAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
  onUpdateLease?: StatefulAction;
  onDeleteLease?: StatefulAction;
  goToSectionIfVisible: (sectionId: string) => void;
  handleTenantInviteSuccess: () => void;
  handleManagerInviteSuccess: () => void;
  handleOwnerInviteSuccess: () => void;
  handleVendorCreatedSuccess: () => void;
  handlePropertyCreated: () => void;
  handleUnitCreated: () => void;
  handleLeaseCreated: () => void;
}

export function SectionRenderer({
  activeSection,
  occupancy,
  data,
  canManagePortfolio,
  safePortfolio,
  tickets,
  invitations,
  safeNotifications,
  safeInboxThreads,
  safeDocuments,
  safeAutomationTemplates,
  safeAutomationRules,
  safeListings,
  safeApplications,
  safeVendors,
  safeExpenses,
  safeOwnershipAccounts,
  safeCapabilities,
  sortedVendors,
  hasLeasingSection,
  hasApplicationsSection,
  hasInboxSection,
  hasAutomationsSection,
  hasNotificationsSection,
  hasOwnershipSection,
  hasInvitationsSection,
  hasDocumentsSection,
  hasVendorsSection,
  hasExpensesSection,
  applicationCount,
  approvedApplicationCount,
  onGenerateChargesHref,
  onPayCharge,
  onUpdateTicketStatus,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onMarkNotificationRead,
  onCreateInboxThread,
  onSendInboxMessage,
  onEnableAutomation,
  onDisableAutomation,
  onCreateRentalListing,
  onUpdateListingStatus,
  onCreateApplication,
  onReviewApplication,
  onAddApplicationNote,
  onRecordScreeningScore,
  onCreateDocumentTemplate,
  onDeleteDocumentTemplate,
  onCreateDocumentPacket,
  onSendDocumentPacket,
  onUploadPropertyFile,
  onDeletePropertyFile,
  onUpdateFileVisibility,
  onCreateVendor,
  onUpdateVendor,
  onAssignVendor,
  onUploadMaintenancePhoto,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onUpdateProperty,
  onDeleteProperty,
  onUpdateUnit,
  onDeleteUnit,
  onUpdateLease,
  onDeleteLease,
  goToSectionIfVisible,
  handleTenantInviteSuccess,
  handleManagerInviteSuccess,
  handleOwnerInviteSuccess,
  handleVendorCreatedSuccess,
  handlePropertyCreated,
  handleUnitCreated,
  handleLeaseCreated
}: SectionRendererProps) {
  if (activeSection === "overview") {
    return (
      <>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Snapshot</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{occupancy}% occupied</p>
          <p className="text-sm text-zinc-600">
            {data.kpis.activeLeaseCount} active lease{data.kpis.activeLeaseCount === 1 ? "" : "s"}
          </p>
        </div>
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
      </>
    );
  }

  if (activeSection === "charges") {
    return (
      <ChargesSection
        charges={data.charges}
        onPayCharge={onPayCharge}
        onGenerateChargesHref={onGenerateChargesHref}
      />
    );
  }

  if (activeSection === "payments") {
    return <PaymentsSection payments={data.recentPayments} />;
  }

  if (activeSection === "maintenance") {
    return (
      <MaintenanceSection
        tickets={tickets ?? []}
        showControls={!!onUpdateTicketStatus}
        onUpdateStatus={onUpdateTicketStatus}
        vendors={sortedVendors}
        onAssignVendor={safeCapabilities.vendorWorkflowEnabled ? onAssignVendor : undefined}
        onUploadPhoto={safeCapabilities.photoWorkflowEnabled ? onUploadMaintenancePhoto : undefined}
        vendorWorkflowEnabled={safeCapabilities.vendorWorkflowEnabled}
        photoWorkflowEnabled={safeCapabilities.photoWorkflowEnabled}
        vendorWorkflowWarning={safeCapabilities.warnings.vendorWorkflow}
        photoWorkflowWarning={safeCapabilities.warnings.photoWorkflow}
      />
    );
  }

  if (activeSection === "leasing" && hasLeasingSection) {
    return (
      <LeasingHubSection
        portfolio={safePortfolio}
        invitations={invitations ?? []}
        documents={safeDocuments}
        listings={safeListings}
        applicationCount={applicationCount ?? safeApplications.length}
        approvedApplicationCount={
          approvedApplicationCount ??
          safeApplications.filter((application) => application.status === "approved").length
        }
        chargeCount={data.charges.length}
        pipelineReady={safeCapabilities.leasingPipelineEnabled}
        pipelineWarning={safeCapabilities.warnings.leasingPipeline}
        onOpenSection={goToSectionIfVisible}
        onCreateListing={onCreateRentalListing}
        onUpdateListingStatus={onUpdateListingStatus}
      />
    );
  }

  if (activeSection === "applications" && hasApplicationsSection) {
    return (
      <ApplicationsSection
        applications={safeApplications}
        listings={safeListings}
        properties={safePortfolio.properties.map((property) => ({
          id: property.id,
          name: property.name
        }))}
        pipelineReady={safeCapabilities.leasingPipelineEnabled}
        pipelineWarning={safeCapabilities.warnings.leasingPipeline}
        onCreateApplication={onCreateApplication}
        onReviewApplication={onReviewApplication}
        onAddApplicationNote={onAddApplicationNote}
        onRecordScreeningScore={onRecordScreeningScore}
      />
    );
  }

  if (activeSection === "inbox" && hasInboxSection) {
    return (
      <InboxSection
        notifications={safeNotifications}
        threads={safeInboxThreads}
        properties={safePortfolio.properties.map((property) => ({
          id: property.id,
          name: property.name
        }))}
        onMarkRead={onMarkNotificationRead!}
        onCreateThread={onCreateInboxThread}
        onSendMessage={onSendInboxMessage}
        threadsReady={safeCapabilities.inboxThreadsEnabled}
        threadsWarning={safeCapabilities.warnings.inboxThreads}
        onOpenSection={goToSectionIfVisible}
      />
    );
  }

  if (activeSection === "automations" && hasAutomationsSection) {
    return (
      <AutomationTemplatesSection
        role={data.profileRole === "manager" ? "manager" : "owner"}
        templates={safeAutomationTemplates}
        rules={safeAutomationRules}
        properties={safePortfolio.properties.map((property) => ({
          id: property.id,
          name: property.name
        }))}
        runtimeReady={safeCapabilities.automationsEnabled}
        runtimeWarning={safeCapabilities.warnings.automations}
        onOpenSection={goToSectionIfVisible}
        onEnableAutomation={onEnableAutomation}
        onDisableAutomation={onDisableAutomation}
      />
    );
  }

  if (activeSection === "notifications" && hasNotificationsSection) {
    return safeCapabilities.notificationsEnabled ? (
      <NotificationsSection
        notifications={safeNotifications}
        onMarkRead={onMarkNotificationRead!}
      />
    ) : (
      <FeatureWarning
        title="Notifications Unavailable"
        message={
          safeCapabilities.warnings.notifications ??
          "Notifications are not ready yet. Complete setup and reload."
        }
      />
    );
  }

  if (activeSection === "ownership" && hasOwnershipSection) {
    return safeCapabilities.ownershipEnabled ? (
      <OwnershipSection
        accounts={safeOwnershipAccounts}
        properties={safePortfolio.properties.map((property) => ({
          id: property.id,
          name: property.name,
          ownerAccountName: property.ownerAccountName
        }))}
        onCreateOwnershipAccount={onCreateOwnershipAccount!}
        onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount!}
      />
    ) : (
      <FeatureWarning
        title="Ownership Accounts Unavailable"
        message={
          safeCapabilities.warnings.ownership ??
          "LLC/shared ownership is not ready yet. Complete Phase 9 setup and reload."
        }
      />
    );
  }

  if (activeSection === "invitations" && hasInvitationsSection) {
    return (
      <InvitationsSection
        ownershipAccounts={safeOwnershipAccounts.map((account) => ({
          id: account.id,
          displayName: account.displayName
        }))}
        properties={safePortfolio.properties}
        invitations={invitations ?? []}
        onInviteTenant={onInviteTenant!}
        onInviteManager={onInviteManager!}
        onInviteOwner={safeCapabilities.ownershipEnabled ? onInviteOwner : undefined}
        onResendInvite={onResendInvite!}
        onTenantInviteSuccess={handleTenantInviteSuccess}
        onManagerInviteSuccess={handleManagerInviteSuccess}
        onOwnerInviteSuccess={handleOwnerInviteSuccess}
      />
    );
  }

  if (activeSection === "documents" && hasDocumentsSection) {
    return (
      <DocumentsSection
        properties={safePortfolio.properties.map((property) => ({
          id: property.id,
          name: property.name
        }))}
        templates={safeDocuments.templates}
        packets={safeDocuments.packets}
        propertyFiles={safeDocuments.propertyFiles}
        leases={safePortfolio.leases}
        ownershipAccounts={safeOwnershipAccounts}
        onCreateTemplate={onCreateDocumentTemplate!}
        onDeleteTemplate={onDeleteDocumentTemplate!}
        onCreatePacket={onCreateDocumentPacket!}
        onSendPacket={onSendDocumentPacket!}
        onUploadPropertyFile={onUploadPropertyFile}
        onDeletePropertyFile={onDeletePropertyFile}
        onUpdateFileVisibility={onUpdateFileVisibility}
        propertyFilesEnabled={safeDocuments.propertyFilesEnabled}
        propertyFilesWarning={safeDocuments.propertyFilesWarning}
        isFeatureReady={safeCapabilities.documentsEnabled}
        featureWarning={safeCapabilities.warnings.documents}
        assetAccessEnabled={safeCapabilities.documentAssetAccessEnabled}
        assetAccessWarning={
          safeCapabilities.documentsEnabled && !safeCapabilities.documentAssetAccessEnabled
            ? "Document packet records are available, but file storage access is not configured yet."
            : null
        }
      />
    );
  }

  if (activeSection === "vendors" && hasVendorsSection) {
    return safeCapabilities.vendorWorkflowEnabled ? (
      <VendorsSection
        vendors={safeVendors}
        ownershipAccounts={safeOwnershipAccounts}
        onCreateVendor={onCreateVendor!}
        onUpdateVendor={onUpdateVendor}
        onCreateVendorSuccess={handleVendorCreatedSuccess}
      />
    ) : (
      <FeatureWarning
        title="Vendors Unavailable"
        message={
          safeCapabilities.warnings.vendorWorkflow ??
          "Vendor workflows are not ready yet. Complete setup and reload."
        }
      />
    );
  }

  if (activeSection === "expenses" && hasExpensesSection) {
    return (
      <ExpensesSection
        data={safeExpenses}
        vendors={safeVendors}
        propertyFiles={safeDocuments.propertyFiles}
        onCreateExpense={onCreateExpense!}
        onUpdateExpense={onUpdateExpense!}
        onDeleteExpense={onDeleteExpense!}
      />
    );
  }

  if (activeSection === "operations") {
    return (
      <OperationsSection
        portfolio={safePortfolio}
        ownershipAccounts={safeOwnershipAccounts}
        onCreateProperty={onCreateProperty}
        onCreateUnit={onCreateUnit}
        onCreateLease={onCreateLease}
        onPropertyCreated={handlePropertyCreated}
        onUnitCreated={handleUnitCreated}
        onLeaseCreated={handleLeaseCreated}
      />
    );
  }

  if (activeSection === "portfolio") {
    return (
      <PortfolioSection
        properties={safePortfolio.properties}
        showControls={canManagePortfolio}
        onUpdateProperty={onUpdateProperty}
        onDeleteProperty={onDeleteProperty}
      />
    );
  }

  if (activeSection === "units") {
    return (
      <UnitsSection
        units={safePortfolio.units}
        showControls={canManagePortfolio}
        onUpdateUnit={onUpdateUnit}
        onDeleteUnit={onDeleteUnit}
      />
    );
  }

  if (activeSection === "leases") {
    return (
      <LeasesSection
        leases={safePortfolio.leases}
        showControls={canManagePortfolio}
        onUpdateLease={onUpdateLease}
        onDeleteLease={onDeleteLease}
      />
    );
  }

  return (
    <FeatureWarning
      title="Section Unavailable"
      message="This section is not currently available for your role."
    />
  );
}
