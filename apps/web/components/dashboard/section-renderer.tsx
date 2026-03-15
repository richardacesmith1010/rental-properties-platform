import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { ActivityFeed } from "./activity-feed";
import { ApplicationsSection } from "./applications-section";
import { ChargesSection } from "./charges-section";
import { ExpensesSection } from "./expenses-section";
import { InvitationsSection } from "./invitations-section";
import { KpiGrid } from "./kpi-grid";
import { LeasingHubSection } from "./leasing-hub-section";
import { LeasesSection } from "./leases-section";
import { MaintenanceSection } from "./maintenance-section";
import { OperationsSection } from "./operations-section";
import { PaymentsSection } from "./payments-section";
import { PortfolioSection } from "./portfolio-section";
import { RentCollectionBar } from "./rent-collection-bar";
import { SectionErrorBoundary } from "./section-error-boundary";
import { UnitsSection } from "./units-section";
import { VendorsSection } from "./vendors-section";
import { computeTrend } from "@/lib/dashboard";
import { lazySectionComponents, type SectionRendererProps } from "./section-map";

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

const {
  notifications: NotificationsSection,
  inbox: InboxSection,
  documents: DocumentsSection,
  ownership: OwnershipSection,
  automations: AutomationTemplatesSection
} = lazySectionComponents;

export function SectionRenderer(props: SectionRendererProps) {
  const currentRentMetric = props.safeAnalytics.rentMetrics.at(-1) ?? null;
  const previousRentMetric = props.safeAnalytics.rentMetrics.at(-2) ?? null;
  const currentOccupancyMetric = props.safeAnalytics.occupancyMetrics.at(-1) ?? null;
  const previousOccupancyMetric = props.safeAnalytics.occupancyMetrics.at(-2) ?? null;
  const propertyOptions = props.safePortfolio.properties.map((property) => ({
    id: property.id,
    name: property.name
  }));
  const ownershipPropertyOptions = props.safePortfolio.properties.map((property) => ({
    id: property.id,
    name: property.name,
    ownerAccountName: property.ownerAccountName
  }));
  const approvedApplicationCount =
    props.approvedApplicationCount ??
    props.safeApplications.filter((application) => application.status === "approved").length;
  const totalApplicationCount = props.applicationCount ?? props.safeApplications.length;
  const revenueTrend = computeTrend(
    currentRentMetric?.dueCents ?? props.data.kpis.monthlyGrossRentCents,
    previousRentMetric?.dueCents ?? null
  );
  const currentCollectionRate =
    currentRentMetric && currentRentMetric.dueCents > 0
      ? (currentRentMetric.collectedCents / currentRentMetric.dueCents) * 100
      : props.data.kpis.collectionRate;
  const previousCollectionRate =
    previousRentMetric && previousRentMetric.dueCents > 0
      ? (previousRentMetric.collectedCents / previousRentMetric.dueCents) * 100
      : null;
  const occupancyTrend = computeTrend(
    currentOccupancyMetric?.rate ?? props.occupancy,
    previousOccupancyMetric?.rate ?? null
  );
  const collectionTrend = computeTrend(currentCollectionRate, previousCollectionRate);
  const renderSection = (sectionName: string, content: ReactNode) => (
    <SectionErrorBoundary sectionName={sectionName}>{content}</SectionErrorBoundary>
  );

  switch (props.activeSection) {
    case "overview":
      return renderSection(
        "Overview",
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Snapshot</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{props.occupancy}% occupied</p>
            <p className="text-sm text-zinc-600">
              {props.data.kpis.activeLeaseCount} active lease
              {props.data.kpis.activeLeaseCount === 1 ? "" : "s"}
            </p>
          </div>
          <KpiGrid
            kpis={props.data.kpis}
            occupancy={props.occupancy}
            netCashFlowCents={props.data.kpis.netCashFlowCents}
            revenueTrend={revenueTrend}
            occupancyTrend={occupancyTrend}
            collectionTrend={collectionTrend}
          />
          <RentCollectionBar
            collectedCents={props.data.kpis.collectedRentCents}
            pendingCents={props.data.kpis.pendingRentCents}
            overdueCents={props.data.kpis.overdueRentCents}
          />
        </>
      );

    case "charges":
      return renderSection(
        "Charges",
        <ChargesSection
          charges={props.data.charges}
          onPayCharge={props.onPayCharge}
          onRecordManualPayment={props.onRecordManualPayment}
          showManualPayment={props.data.profileRole !== "tenant"}
          onGenerateChargesHref={props.onGenerateChargesHref}
          ownerConnectedMap={props.ownerConnectedMap}
          stripeConnected={props.stripeConnected}
        />
      );

    case "payments":
      return renderSection("Payments", <PaymentsSection payments={props.data.recentPayments} />);

    case "maintenance":
      return renderSection(
        "Maintenance",
        <MaintenanceSection
          tickets={props.tickets ?? []}
          showControls={!!props.onUpdateTicketStatus}
          onUpdateStatus={props.onUpdateTicketStatus}
          onAddComment={props.onAddTicketComment}
          vendors={props.sortedVendors}
          onAssignVendor={
            props.safeCapabilities.vendorWorkflowEnabled ? props.onAssignVendor : undefined
          }
          onUploadPhoto={
            props.safeCapabilities.photoWorkflowEnabled ? props.onUploadMaintenancePhoto : undefined
          }
          vendorWorkflowEnabled={props.safeCapabilities.vendorWorkflowEnabled}
          photoWorkflowEnabled={props.safeCapabilities.photoWorkflowEnabled}
          vendorWorkflowWarning={props.safeCapabilities.warnings.vendorWorkflow}
          photoWorkflowWarning={props.safeCapabilities.warnings.photoWorkflow}
        />
      );

    case "leasing":
      if (!props.hasLeasingSection) break;
      return renderSection(
        "Leasing",
        <LeasingHubSection
          portfolio={props.safePortfolio}
          invitations={props.invitations ?? []}
          documents={props.safeDocuments}
          listings={props.safeListings}
          applicationCount={totalApplicationCount}
          approvedApplicationCount={approvedApplicationCount}
          chargeCount={props.data.charges.length}
          pipelineReady={props.safeCapabilities.leasingPipelineEnabled}
          pipelineWarning={props.safeCapabilities.warnings.leasingPipeline}
          onOpenSection={props.goToSectionIfVisible}
          onCreateListing={props.onCreateRentalListing}
          onUpdateListingStatus={props.onUpdateListingStatus}
        />
      );

    case "applications":
      if (!props.hasApplicationsSection) break;
      return renderSection(
        "Applications",
        <ApplicationsSection
          applications={props.safeApplications}
          listings={props.safeListings}
          properties={propertyOptions}
          pipelineReady={props.safeCapabilities.leasingPipelineEnabled}
          pipelineWarning={props.safeCapabilities.warnings.leasingPipeline}
          onCreateApplication={props.onCreateApplication}
          onReviewApplication={props.onReviewApplication}
          onAddApplicationNote={props.onAddApplicationNote}
          onRecordScreeningScore={props.onRecordScreeningScore}
        />
      );

    case "inbox":
      if (!props.hasInboxSection) break;
      return renderSection(
        "Inbox",
        <InboxSection
          notifications={props.safeNotifications}
          threads={props.safeInboxThreads}
          properties={propertyOptions}
          onMarkRead={props.onMarkNotificationRead!}
          onCreateThread={props.onCreateInboxThread}
          onSendMessage={props.onSendInboxMessage}
          threadsReady={props.safeCapabilities.inboxThreadsEnabled}
          threadsWarning={props.safeCapabilities.warnings.inboxThreads}
          onOpenSection={props.goToSectionIfVisible}
        />
      );

    case "automations":
      if (!props.hasAutomationsSection) break;
      return renderSection(
        "Automations",
        <AutomationTemplatesSection
          role={props.data.profileRole === "manager" ? "manager" : "owner"}
          templates={props.safeAutomationTemplates}
          rules={props.safeAutomationRules}
          properties={propertyOptions}
          runtimeReady={props.safeCapabilities.automationsEnabled}
          runtimeWarning={props.safeCapabilities.warnings.automations}
          onOpenSection={props.goToSectionIfVisible}
          onEnableAutomation={props.onEnableAutomation}
          onDisableAutomation={props.onDisableAutomation}
        />
      );

    case "notifications":
      if (!props.hasNotificationsSection) break;
      return renderSection(
        "Notifications",
        props.safeCapabilities.notificationsEnabled ? (
          <NotificationsSection
            notifications={props.safeNotifications}
            onMarkRead={props.onMarkNotificationRead!}
            onMarkAllRead={props.onMarkAllNotificationsRead}
          />
        ) : (
          <FeatureWarning
            title="Notifications Unavailable"
            message={
              props.safeCapabilities.warnings.notifications ??
              "Notifications are not ready yet. Complete setup and reload."
            }
          />
        )
      );

    case "activity":
      if (!props.hasActivitySection) break;
      return renderSection("Activity", <ActivityFeed logs={props.auditLogs} />);

    case "ownership":
      if (!props.hasOwnershipSection) break;
      return renderSection(
        "Ownership",
        props.safeCapabilities.ownershipEnabled ? (
          <OwnershipSection
            activeAccountId={props.activeAccountId}
            accounts={props.safeOwnershipAccounts}
            properties={ownershipPropertyOptions}
            members={props.ownershipMembers}
            pendingAccountRenameRequests={props.pendingAccountRenameRequests}
            pendingAccountDeleteRequests={props.pendingAccountDeleteRequests}
            distributionHistory={props.distributionHistory}
            pendingChangeRequests={props.pendingChangeRequests}
            pendingWithdrawals={props.pendingWithdrawals}
            financialActivityFeed={props.financialActivityFeed}
            currentUserId={props.currentUserId}
            onCreateOwnershipAccount={props.onCreateOwnershipAccount!}
            onLinkPropertyToOwnershipAccount={props.onLinkPropertyToOwnershipAccount!}
            onRenameOwnershipAccount={props.onRenameOwnershipAccount}
            onVoteOnAccountRename={props.onVoteOnAccountRename}
            onRequestDeleteLLC={props.onRequestDeleteLLC}
            onVoteOnDeleteLLC={props.onVoteOnDeleteLLC}
            onInitiateAccountStripeConnect={props.onInitiateAccountStripeConnect}
            onUpdateDistributionConfig={props.onUpdateDistributionConfig}
            onSubmitDistributionChangeRequest={props.onSubmitDistributionChangeRequest}
            onVoteOnDistributionChange={props.onVoteOnDistributionChange}
            onInitiateMemberPayoutConnect={props.onInitiateMemberPayoutConnect}
            onSubmitWithdrawalRequest={props.onSubmitWithdrawalRequest}
            onVoteOnWithdrawal={props.onVoteOnWithdrawal}
            onInitiatePlaidLink={props.onInitiatePlaidLink}
            onCompletePlaidLink={props.onCompletePlaidLink}
            onRefreshPlaidBalance={props.onRefreshPlaidBalance}
            onDisconnectPlaid={props.onDisconnectPlaid}
            onExecuteApprovedWithdrawal={props.onExecuteApprovedWithdrawal}
          />
        ) : (
          <FeatureWarning
            title="Ownership Accounts Unavailable"
            message={
              props.safeCapabilities.warnings.ownership ??
              "LLC/shared ownership is not ready yet. Complete Phase 9 setup and reload."
            }
          />
        )
      );

    case "invitations":
      if (!props.hasInvitationsSection) break;
      return renderSection(
        "Invitations",
        <InvitationsSection
          ownershipAccounts={props.safeOwnershipAccounts.map((account) => ({
            id: account.id,
            displayName: account.displayName
          }))}
          properties={props.safePortfolio.properties}
          invitations={props.invitations ?? []}
          onInviteTenant={props.onInviteTenant!}
          onInviteManager={props.onInviteManager!}
          onInviteOwner={
            props.safeCapabilities.ownershipEnabled ? props.onInviteOwner : undefined
          }
          onResendInvite={props.onResendInvite!}
          onTenantInviteSuccess={props.handleTenantInviteSuccess}
          onManagerInviteSuccess={props.handleManagerInviteSuccess}
          onOwnerInviteSuccess={props.handleOwnerInviteSuccess}
        />
      );

    case "documents":
      if (!props.hasDocumentsSection) break;
      return renderSection(
        "Documents",
        <DocumentsSection
          properties={propertyOptions}
          templates={props.safeDocuments.templates}
          packets={props.safeDocuments.packets}
          propertyFiles={props.safeDocuments.propertyFiles}
          leases={props.safePortfolio.leases}
          ownershipAccounts={props.safeOwnershipAccounts}
          onCreateTemplate={props.onCreateDocumentTemplate!}
          onDeleteTemplate={props.onDeleteDocumentTemplate!}
          onCreatePacket={props.onCreateDocumentPacket!}
          onSendPacket={props.onSendDocumentPacket!}
          onUploadPropertyFile={props.onUploadPropertyFile}
          onDeletePropertyFile={props.onDeletePropertyFile}
          onUpdateFileVisibility={props.onUpdateFileVisibility}
          propertyFilesEnabled={props.safeDocuments.propertyFilesEnabled}
          propertyFilesWarning={props.safeDocuments.propertyFilesWarning}
          isFeatureReady={props.safeCapabilities.documentsEnabled}
          featureWarning={props.safeCapabilities.warnings.documents}
          assetAccessEnabled={props.safeCapabilities.documentAssetAccessEnabled}
          assetAccessWarning={
            props.safeCapabilities.documentsEnabled && !props.safeCapabilities.documentAssetAccessEnabled
              ? "Document packet records are available, but file storage access is not configured yet."
              : null
          }
        />
      );

    case "vendors":
      if (!props.hasVendorsSection) break;
      return renderSection(
        "Vendors",
        props.safeCapabilities.vendorWorkflowEnabled ? (
          <VendorsSection
            vendors={props.safeVendors}
            ownershipAccounts={props.safeOwnershipAccounts}
            onCreateVendor={props.onCreateVendor!}
            onUpdateVendor={props.onUpdateVendor}
            onCreateVendorSuccess={props.handleVendorCreatedSuccess}
          />
        ) : (
          <FeatureWarning
            title="Vendors Unavailable"
            message={
              props.safeCapabilities.warnings.vendorWorkflow ??
              "Vendor workflows are not ready yet. Complete setup and reload."
            }
          />
        )
      );

    case "expenses":
      if (!props.hasExpensesSection) break;
      return renderSection(
        "Expenses",
        <ExpensesSection
          data={props.safeExpenses}
          vendors={props.safeVendors}
          propertyFiles={props.safeDocuments.propertyFiles}
          onCreateExpense={props.onCreateExpense!}
          onUpdateExpense={props.onUpdateExpense!}
          onDeleteExpense={props.onDeleteExpense!}
        />
      );

    case "analytics":
      if (!props.hasAnalyticsSection) break;
      return renderSection("Analytics", <AnalyticsSection data={props.safeAnalytics} />);

    case "operations":
      return renderSection(
        "Operations",
        <OperationsSection
          portfolio={props.safePortfolio}
          ownershipAccounts={props.safeOwnershipAccounts}
          onCreateProperty={props.onCreateProperty}
          onCreateUnit={props.onCreateUnit}
          onCreateLease={props.onCreateLease}
          onPropertyCreated={props.handlePropertyCreated}
          onUnitCreated={props.handleUnitCreated}
          onLeaseCreated={props.handleLeaseCreated}
        />
      );

    case "portfolio":
      return renderSection(
        "Portfolio",
        <PortfolioSection
          properties={props.safePortfolio.properties}
          showControls={props.canManagePortfolio}
          onUpdateProperty={props.onUpdateProperty}
          onDeleteProperty={props.onDeleteProperty}
          onUpdateManagementFee={
            props.data.profileRole === "owner" ? props.onUpdateManagementFee : undefined
          }
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
        />
      );

    case "units":
      return renderSection(
        "Units",
        <UnitsSection
          units={props.safePortfolio.units}
          showControls={props.canManagePortfolio}
          onUpdateUnit={props.onUpdateUnit}
          onDeleteUnit={props.onDeleteUnit}
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
        />
      );

    case "leases":
      return renderSection(
        "Leases",
        <LeasesSection
          leases={props.safePortfolio.leases}
          rentIncreaseHistory={props.rentIncreaseHistory}
          showControls={props.canManagePortfolio}
          onUpdateLease={props.onUpdateLease}
          onDeleteLease={props.onDeleteLease}
          onRenewLease={props.onRenewLease}
          onTerminateLease={props.onTerminateLease}
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
        />
      );

    default:
      return renderSection(
        "Unavailable section",
        <FeatureWarning
          title="Section Unavailable"
          message="This section is not currently available for your role."
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
