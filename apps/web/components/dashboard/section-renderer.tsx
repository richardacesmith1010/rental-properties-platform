import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { DistributionHistoryEntry } from "@/lib/distributions";
import type { ActionState } from "@/app/actions";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { KpiGrid } from "./kpi-grid";
import { ActivityFeed } from "./activity-feed";
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
import { SectionErrorBoundary } from "./section-error-boundary";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const AnalyticsSection = dynamic(
  () => import("./analytics-section").then((module) => module.AnalyticsSection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
        Loading analytics...
      </div>
    )
  }
);

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
  safeAnalytics: AnalyticsDashboardData;
  auditLogs: AuditLogEntry[];
  rentIncreaseHistory: RentIncreaseEntry[];
  safeOwnershipAccounts: OwnershipAccountDTO[];
  ownershipMembers?: OwnershipMemberDTO[];
  distributionHistory?: DistributionHistoryEntry[];
  activeAccountId?: string | null;
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
  hasAnalyticsSection: boolean;
  hasActivitySection: boolean;
  applicationCount?: number;
  approvedApplicationCount?: number;
  stripeConnected?: boolean;
  ownerConnectedMap?: Map<string, boolean>;
  onGenerateChargesHref?: string;
  onPayCharge: FormAction;
  onRecordManualPayment?: StatefulAction;
  onUpdateTicketStatus?: StatefulAction;
  onInviteTenant?: StatefulAction;
  onInviteManager?: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onMarkAllNotificationsRead?: StatefulAction;
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
  onInitiateAccountStripeConnect?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
  onUpdateManagementFee?: StatefulAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
  onUpdateLease?: StatefulAction;
  onDeleteLease?: StatefulAction;
  onRenewLease?: StatefulAction;
  onTerminateLease?: StatefulAction;
  onAddTicketComment?: StatefulAction;
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
  safeAnalytics,
  auditLogs,
  rentIncreaseHistory,
  safeOwnershipAccounts,
  ownershipMembers,
  distributionHistory,
  activeAccountId,
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
  hasAnalyticsSection,
  hasActivitySection,
  applicationCount,
  approvedApplicationCount,
  stripeConnected,
  ownerConnectedMap,
  onGenerateChargesHref,
  onPayCharge,
  onRecordManualPayment,
  onUpdateTicketStatus,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
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
  onInitiateAccountStripeConnect,
  onUpdateDistributionConfig,
  onInitiateMemberPayoutConnect,
  onUpdateManagementFee,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onUpdateProperty,
  onDeleteProperty,
  onUpdateUnit,
  onDeleteUnit,
  onUpdateLease,
  onDeleteLease,
  onRenewLease,
  onTerminateLease,
  onAddTicketComment,
  goToSectionIfVisible,
  handleTenantInviteSuccess,
  handleManagerInviteSuccess,
  handleOwnerInviteSuccess,
  handleVendorCreatedSuccess,
  handlePropertyCreated,
  handleUnitCreated,
  handleLeaseCreated
}: SectionRendererProps) {
  const renderSection = (sectionName: string, content: ReactNode) => (
    <SectionErrorBoundary sectionName={sectionName}>{content}</SectionErrorBoundary>
  );

  if (activeSection === "overview") {
    return renderSection(
      "Overview",
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
    return renderSection(
      "Charges",
      <ChargesSection
        charges={data.charges}
        onPayCharge={onPayCharge}
        onRecordManualPayment={onRecordManualPayment}
        showManualPayment={data.profileRole !== "tenant"}
        onGenerateChargesHref={onGenerateChargesHref}
        ownerConnectedMap={ownerConnectedMap}
        stripeConnected={stripeConnected}
      />
    );
  }

  if (activeSection === "payments") {
    return renderSection("Payments", <PaymentsSection payments={data.recentPayments} />);
  }

  if (activeSection === "maintenance") {
    return renderSection(
      "Maintenance",
      <MaintenanceSection
        tickets={tickets ?? []}
        showControls={!!onUpdateTicketStatus}
        onUpdateStatus={onUpdateTicketStatus}
        onAddComment={onAddTicketComment}
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
    return renderSection(
      "Leasing",
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
    return renderSection(
      "Applications",
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
    return renderSection(
      "Inbox",
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
    return renderSection(
      "Automations",
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
    return renderSection(
      "Notifications",
      safeCapabilities.notificationsEnabled ? (
        <NotificationsSection
          notifications={safeNotifications}
          onMarkRead={onMarkNotificationRead!}
          onMarkAllRead={onMarkAllNotificationsRead}
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
    );
  }

  if (activeSection === "activity" && hasActivitySection) {
    return renderSection("Activity", <ActivityFeed logs={auditLogs} />);
  }

  if (activeSection === "ownership" && hasOwnershipSection) {
    return renderSection(
      "Ownership",
      safeCapabilities.ownershipEnabled ? (
        <OwnershipSection
          activeAccountId={activeAccountId}
          accounts={safeOwnershipAccounts}
          properties={safePortfolio.properties.map((property) => ({
            id: property.id,
            name: property.name,
            ownerAccountName: property.ownerAccountName
          }))}
          members={ownershipMembers}
          distributionHistory={distributionHistory}
          onCreateOwnershipAccount={onCreateOwnershipAccount!}
          onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount!}
          onInitiateAccountStripeConnect={onInitiateAccountStripeConnect}
          onUpdateDistributionConfig={onUpdateDistributionConfig}
          onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
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
    );
  }

  if (activeSection === "invitations" && hasInvitationsSection) {
    return renderSection(
      "Invitations",
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
    return renderSection(
      "Documents",
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
    return renderSection(
      "Vendors",
      safeCapabilities.vendorWorkflowEnabled ? (
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
      )
    );
  }

  if (activeSection === "expenses" && hasExpensesSection) {
    return renderSection(
      "Expenses",
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

  if (activeSection === "analytics" && hasAnalyticsSection) {
    return renderSection("Analytics", <AnalyticsSection data={safeAnalytics} />);
  }

  if (activeSection === "operations") {
    return renderSection(
      "Operations",
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
    return renderSection(
      "Portfolio",
      <PortfolioSection
        properties={safePortfolio.properties}
        showControls={canManagePortfolio}
        onUpdateProperty={onUpdateProperty}
        onDeleteProperty={onDeleteProperty}
        onUpdateManagementFee={data.profileRole === "owner" ? onUpdateManagementFee : undefined}
        onGoToOperations={() => goToSectionIfVisible("operations")}
      />
    );
  }

  if (activeSection === "units") {
    return renderSection(
      "Units",
      <UnitsSection
        units={safePortfolio.units}
        showControls={canManagePortfolio}
        onUpdateUnit={onUpdateUnit}
        onDeleteUnit={onDeleteUnit}
        onGoToOperations={() => goToSectionIfVisible("operations")}
      />
    );
  }

  if (activeSection === "leases") {
    return renderSection(
      "Leases",
      <LeasesSection
        leases={safePortfolio.leases}
        rentIncreaseHistory={rentIncreaseHistory}
        showControls={canManagePortfolio}
        onUpdateLease={onUpdateLease}
        onDeleteLease={onDeleteLease}
        onRenewLease={onRenewLease}
        onTerminateLease={onTerminateLease}
        onGoToOperations={() => goToSectionIfVisible("operations")}
      />
    );
  }

  return renderSection(
    "Unavailable section",
    <FeatureWarning
      title="Section Unavailable"
      message="This section is not currently available for your role."
    />
  );
}
