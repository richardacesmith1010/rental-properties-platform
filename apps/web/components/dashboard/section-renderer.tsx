import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { ActivityFeed } from "./activity-feed";
import { ApplicationsSection } from "./applications-section";
import { ChargesSection } from "./charges-section";
import { ExpensesSection } from "./expenses-section";
import { InvitationsSection } from "./invitations-section";
import { LeasingHubSection } from "./leasing-hub-section";
import { LeasesSection } from "./leases-section";
import { ManagerPaymentsSection } from "./manager-payments-section";
import { MaintenanceSection } from "./maintenance-section";
import { OperationsSection, type OperationTask } from "./operations-section";
import { PaymentsSection } from "./payments-section";
import { OverviewSectionContent, PortfolioSectionContent, SectionFrame } from "./section-renderer-support";
import { UnitsSection } from "./units-section";
import { VendorsSection } from "./vendors-section";
import { lazySectionComponents, type SectionRendererProps } from "./section-map";

const AnalyticsSection = dynamic(
  () => import("./analytics-section").then((module) => module.AnalyticsSection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
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
  members: MembersSection,
  automations: AutomationTemplatesSection
} = lazySectionComponents;

interface SectionRendererComponentProps extends SectionRendererProps {
  initialOperationsTask?: OperationTask;
  initialOperationsPropertyId?: string | null;
  onInitialOperationsStateConsumed?: () => void;
}

export function SectionRenderer(props: SectionRendererComponentProps) {
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
  const activeOwnershipAccount =
    (props.activeAccountId
      ? props.safeOwnershipAccounts.find((account) => account.id === props.activeAccountId)
      : props.safeOwnershipAccounts[0]) ?? null;
  const renderSection = (sectionName: string, content: ReactNode) => (
    <SectionFrame props={props} sectionName={sectionName}>
      {content}
    </SectionFrame>
  );
  switch (props.activeSection) {
    case "overview":
      return renderSection("Overview", <OverviewSectionContent props={props} />);

    case "charges":
      return renderSection(
        "Charges",
        <ChargesSection
          charges={props.data.charges}
          onPayCharge={props.onPayCharge}
          onDeletePendingCharge={props.onDeletePendingCharge}
          onEditCharge={props.onEditCharge}
          onCreateManualCharge={props.onCreateManualCharge}
          onWaiveCharge={props.onWaiveCharge}
          onRecordManualPayment={props.onRecordManualPayment}
          onSendMessageToTenant={props.onSendMessageToTenant}
          onSendBatchPaymentReminder={
            props.data.profileRole === "owner" ? props.onSendBatchPaymentReminder : undefined
          }
          showManualPayment={props.data.profileRole !== "tenant"}
          onGenerateChargesHref={props.onGenerateChargesHref}
          ownerConnectedMap={props.ownerConnectedMap}
          stripeConnected={props.stripeConnected}
          previewCount={props.isOwnerDailyOpsCarousel ? 5 : undefined}
          availableLeases={props.safePortfolio.leases
            .filter((lease) => lease.active)
            .map((lease) => ({
              id: lease.id,
              tenantLabel: lease.tenantEmail,
              propertyLabel: lease.unitLabel
            }))}
        />
      );

    case "payments":
      return renderSection("Payments", <PaymentsSection payments={props.data.recentPayments} />);

    case "maintenance":
      return renderSection(
        "Maintenance",
        <MaintenanceSection
          tickets={props.filteredTickets}
          showControls={!!props.onUpdateTicketStatus}
          currentUserId={props.currentUserId}
          viewerRole={props.data.profileRole}
          onUpdateStatus={props.onUpdateTicketStatus}
          onAddComment={props.onAddTicketComment}
          vendors={props.sortedVendors}
          onAssignVendor={
            props.safeCapabilities.vendorWorkflowEnabled ? props.onAssignVendor : undefined
          }
          onUploadPhoto={
            props.safeCapabilities.photoWorkflowEnabled ? props.onUploadMaintenancePhoto : undefined
          }
          onDeletePhoto={
            props.safeCapabilities.photoWorkflowEnabled ? props.onDeleteMaintenancePhoto : undefined
          }
          vendorWorkflowEnabled={props.safeCapabilities.vendorWorkflowEnabled}
          photoWorkflowEnabled={props.safeCapabilities.photoWorkflowEnabled}
          vendorWorkflowWarning={props.safeCapabilities.warnings.vendorWorkflow}
          photoWorkflowWarning={props.safeCapabilities.warnings.photoWorkflow}
          previewCount={props.isOwnerDailyOpsCarousel ? 4 : undefined}
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
            role={props.data.profileRole}
            onMarkRead={props.onMarkNotificationRead!}
            onMarkAllRead={props.onMarkAllNotificationsRead}
            onSendBatchPaymentReminder={
              props.data.profileRole === "owner" ? props.onSendBatchPaymentReminder : undefined
            }
            onWaiveCharge={props.data.profileRole === "owner" ? props.onWaiveCharge : undefined}
            onMarkManagerPaymentPaid={
              props.data.profileRole === "owner" ? props.onMarkManagerPaymentPaid : undefined
            }
            onOpenSection={props.openSection}
            enhanced={props.data.profileRole === "owner"}
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

    case "members":
      if (!props.hasMembersSection) break;
      return renderSection(
        "Members",
        <MembersSection
          account={activeOwnershipAccount}
          members={props.ownershipMembers ?? []}
          pendingInvitations={props.pendingLlcInvitations ?? []}
          currentUserId={props.currentUserId}
          onRenameOwnershipAccount={props.onRenameOwnershipAccount}
          onRemoveOwnershipMember={props.onRemoveOwnershipMember}
          onSendLLCInvitations={props.onSendLLCInvitations}
          onResendLLCInvitation={props.onResendLLCInvitation}
          onCancelLLCInvitation={props.onCancelLLCInvitation}
          onUpdateDistributionConfig={props.onUpdateDistributionConfig}
          onSubmitDistributionChangeRequest={props.onSubmitDistributionChangeRequest}
          onInitiateMemberPayoutConnect={props.onInitiateMemberPayoutConnect}
        />
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
          onRevokeInvite={props.onRevokeInvite}
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
          initialTask={props.initialOperationsTask}
          initialPropertyId={props.initialOperationsPropertyId}
          onInitialStateConsumed={props.onInitialOperationsStateConsumed}
        />
      );

    case "portfolio":
      return renderSection("Portfolio", <PortfolioSectionContent props={props} />);

    case "units":
      return renderSection(
        "Units",
        <UnitsSection
          units={props.filteredPortfolio.units}
          showControls={props.canManagePortfolio}
          onUpdateUnitField={
            props.data.profileRole === "owner" ? props.onUpdateUnitField : undefined
          }
          onUpdateUnit={props.onUpdateUnit}
          onDeleteUnit={props.onDeleteUnit}
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
        />
      );

    case "leases":
      return renderSection(
        "Leases",
        <LeasesSection
          leases={props.filteredPortfolio.leases}
          rentIncreaseHistory={props.rentIncreaseHistory}
          showControls={props.canManagePortfolio}
          onUpdateLease={props.onUpdateLease}
          onUpdateRentAmount={props.onUpdateRentAmount}
          onUpdateTenantDisplayInfo={props.onUpdateTenantDisplayInfo}
          onSendMessageToTenant={props.onSendMessageToTenant}
          onDeleteLease={props.onDeleteLease}
          onRenewLease={props.onRenewLease}
          onTerminateLease={props.onTerminateLease}
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
          onOpenLeaseWizard={props.openLeaseWizard}
          previewCount={props.isOwnerDailyOpsCarousel ? 4 : undefined}
        />
      );

    case "manager-payments":
      if (!props.hasManagerPaymentsSection) break;
      return renderSection(
        "Manager Payments",
        <ManagerPaymentsSection
          configs={props.managerPaymentConfigs}
          payments={props.managerPayments}
          managers={props.managerPaymentManagers}
          properties={propertyOptions}
          warning={props.managerPaymentsWarning}
          onSetupManagerPaymentConfig={props.onSetupManagerPaymentConfig}
          onRecordManagerPayment={props.onRecordManagerPayment}
          onUpdateManagerInfo={props.onUpdateManagerInfo}
          onMarkManagerPaymentPaid={props.onMarkManagerPaymentPaid}
          onCancelManagerPayment={props.onCancelManagerPayment}
          onGenerateMonthlyManagerPayments={props.onGenerateMonthlyManagerPayments}
          previewCount={props.isOwnerDailyOpsCarousel ? 4 : undefined}
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
