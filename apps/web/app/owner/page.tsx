import { Dashboard } from "@/components/dashboard";
import { StripeTestModeBanner } from "@/components/shared/stripe-test-mode-banner";
import { getDashboardData } from "@/lib/dashboard";
import { getNewFeedbackCountForOwner } from "@/lib/feedback";
import { getGeneratedMessage } from "@/lib/format";
import { getUserNotificationPreferenceSettings } from "@/lib/notification-preferences";
import { getPortfolioData } from "@/lib/portfolio";
import { getAdministeredPropertyOptions } from "@/lib/property-access";
import { getAdminMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
import { getOwnerDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getAutomationRulesForUser, getAutomationTemplates } from "@/lib/automations";
import { getInboxThreadsForUser } from "@/lib/inbox";
import { getRentalListingsForUser } from "@/lib/leasing";
import { getApplicationsForUser, type ApplicationDTO } from "@/lib/applications";
import { getOwnerVendors } from "@/lib/vendors";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import {
  getActiveLlcMembershipsForUser,
  getOwnershipAccountsForUser,
  getOwnershipMembersForAccount,
  getPendingAccountDeleteRequests,
  getPendingAccountRenameRequests
} from "@/lib/ownership";
import { getPendingLLCInvitationsForAccount } from "@/lib/llc-invitations";
import { getOwnerExpenseData } from "@/lib/expenses";
import { getUserGamification } from "@/lib/gamification";
import { getOwnerAnalyticsData } from "@/lib/analytics";
import { getRecentAuditLogs } from "@/lib/audit";
import { getRentIncreaseHistory } from "@/lib/rent-increases";
import { getDistributionHistory, getFinancialActivityFeed } from "@/lib/distributions";
import { getPendingChangeRequests } from "@/lib/distribution-approvals";
import { getPendingWithdrawals } from "@/lib/withdrawals";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import { getManagerPaymentsDashboardData } from "@/lib/manager-payments-data";
import {
  createAnnouncement,
  getEstimatedRecipientCount,
} from "@/app/actions/announcements";
import {
  completePlaidLink,
  disconnectPlaid,
  executeApprovedWithdrawal,
  initiateAccountStripeConnect,
  initiatePlaidLink,
  initiateMemberPayoutConnect,
  refreshPlaidBalance,
  submitDistributionChangeRequest,
  submitWithdrawalRequest,
  payWithCard,
  createTenantActivity,
  getTenantActivityLog,
  createManualCharge,
  createPropertyWithSetup,
  deletePendingCharge,
  editCharge,
  recordManualPayment,
  createLease,
  updateRentAmount,
  deleteLease,
  renewLease,
  terminateLease,
  waiveCharge,
  createProperty,
  renameProperty,
  deleteProperty,
  createUnit,
  updateUnitField,
  deleteUnit,
  signOut,
  updateTicketStatus,
  addTicketComment,
  inviteTenant,
  inviteManager,
  inviteOwner,
  resendInvite,
  revokeInvite,
  resumeNotificationEmails,
  markNotificationRead,
  markAllNotificationsRead,
  sendBatchPaymentReminder,
  createInboxThread,
  sendMessageToTenant,
  sendInboxMessage,
  enableAutomation,
  disableAutomation,
  createRentalListing,
  updateListingStatus,
  createApplication,
  reviewApplication,
  addApplicationNote,
  recordScreeningScore,
  createDocumentTemplate,
  deleteDocumentTemplate,
  createDocumentPacket,
  sendDocumentPacket,
  uploadPropertyFile,
  deletePropertyFile,
  updateFileVisibility,
  createVendor,
  updateVendor,
  assignVendorToTicket,
  uploadMaintenancePhoto,
  deleteMaintenancePhoto,
  createExpense,
  updateExpense,
  deleteExpense,
  createOwnershipAccount,
  linkPropertyToOwnershipAccount,
  removeOwnershipMember,
  sendLLCInvitations,
  resendLLCInvitation,
  cancelLLCInvitation,
  renameOwnershipAccount,
  voteOnAccountRename,
  requestDeleteLLC,
  voteOnDeleteLLC,
  updateDistributionConfig,
  voteOnDistributionChange,
  voteOnWithdrawal,
  updateManagementFee
} from "@/app/actions";
import {
  updateLeaseDetails,
  updatePropertyDetails,
  updateUnitDetails
} from "@/app/actions/entity-updates";
import {
  updateManagerInfo,
  updateTenantDisplayInfo
} from "@/app/actions/entity-profile-updates";
import {
  setupManagerPaymentConfig,
  recordManagerPayment,
  markManagerPaymentPaid,
  cancelManagerPayment,
  generateMonthlyManagerPayments
} from "@/app/actions/manager-payments";
import {
  getAuthenticatedUser,
  getCurrentUserRole,
  getRoleHomePath,
  getUserProfileSummary
} from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface OwnerPageProps {
  searchParams?: {
    generated?: string | string[];
    section?: string | string[];
    mode?: string | string[];
    account?: string | string[];
    property?: string | string[];
  };
}

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (role !== "owner") {
    redirect(getRoleHomePath(role));
  }

  const profile = await getUserProfileSummary(user.id);
  if (!profile.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const ownershipAccounts = await getOwnershipAccountsForUser(user.id);
  if (ownershipAccounts.length === 0) {
    redirect("/owner/setup");
  }
  const accountParam =
    typeof searchParams?.account === "string"
      ? searchParams.account
      : Array.isArray(searchParams?.account)
        ? searchParams.account[0] ?? null
        : null;
  const activeAccountId = ownershipAccounts.some((account) => account.id === accountParam)
    ? accountParam!
    : ownershipAccounts[0]?.id ?? null;

  const capabilities = await getFeatureCapabilities();
  const generatedMessage = getGeneratedMessage(searchParams?.generated);
  const ownerMode =
    typeof searchParams?.mode === "string"
      ? searchParams.mode
      : Array.isArray(searchParams?.mode)
        ? searchParams.mode[0] ?? null
        : null;
  const initialOwnerWorkflowMode =
    ownerMode === "daily_ops" ||
    ownerMode === "new_property" ||
    ownerMode === "new_tenant" ||
    ownerMode === "new_manager" ||
    ownerMode === "records"
      ? ownerMode
      : undefined;
  const initialSectionId =
    typeof searchParams?.section === "string"
      ? searchParams.section
      : Array.isArray(searchParams?.section)
        ? searchParams?.section[0] ?? null
        : null;
  const initialPropertyId =
    typeof searchParams?.property === "string"
      ? searchParams.property
      : Array.isArray(searchParams?.property)
        ? searchParams?.property[0] ?? null
        : null;

  const [
    dashboard,
    portfolio,
    announcementProperties,
    tickets,
    invitations,
    documents,
    notifications,
    notificationPreferenceSettings,
    inboxThreads,
    automationTemplates,
    automationRules,
    listings,
    applications,
    vendors,
    expenses,
    managerPaymentsData,
    gamification,
    analytics,
    auditLogs,
    rentIncreaseHistory,
    llcPayoutMemberships,
    newFeedbackCount
  ] = await Promise.all([
    getDashboardData(user.id, activeAccountId),
    getPortfolioData(user.id, activeAccountId),
    getAdministeredPropertyOptions(user.id),
    getAdminMaintenanceTickets(user.id, activeAccountId),
    getOwnerInvitations(user.id, activeAccountId),
    capabilities.documentsEnabled
      ? getOwnerDocumentsData(user.id, activeAccountId)
      : Promise.resolve({
          templates: [],
          packets: [],
          propertyFiles: [],
          propertyFilesEnabled: false,
          propertyFilesWarning: "Property file vault is not enabled yet."
        }),
    capabilities.notificationsEnabled
      ? getNotificationsForUser(user.id)
      : Promise.resolve([]),
    getUserNotificationPreferenceSettings(user.id),
    capabilities.inboxThreadsEnabled
      ? getInboxThreadsForUser(user.id)
      : Promise.resolve([]),
    capabilities.automationsEnabled
      ? getAutomationTemplates()
      : Promise.resolve([]),
    capabilities.automationsEnabled
      ? getAutomationRulesForUser(user.id)
      : Promise.resolve([]),
    capabilities.leasingPipelineEnabled
      ? getRentalListingsForUser(user.id, activeAccountId)
      : Promise.resolve([]),
    capabilities.leasingPipelineEnabled
      ? getApplicationsForUser(user.id, activeAccountId)
      : Promise.resolve([] as ApplicationDTO[]),
    capabilities.vendorWorkflowEnabled
      ? getOwnerVendors(user.id, activeAccountId)
      : Promise.resolve([]),
    getOwnerExpenseData(user.id, activeAccountId),
    getManagerPaymentsDashboardData(user.id, activeAccountId),
    getUserGamification(user.id),
    getOwnerAnalyticsData(user.id, activeAccountId),
    getRecentAuditLogs(user.id, activeAccountId),
    getRentIncreaseHistory(user.id, activeAccountId),
    getActiveLlcMembershipsForUser(user.id),
    getNewFeedbackCountForOwner(user.email)
  ]);

  const approvedApplicationCount = applications.filter(
    (application) => application.status === "approved"
  ).length;
  const activeAccount = ownershipAccounts.find((account) => account.id === activeAccountId);
  const isLlcAccount = activeAccount?.accountType === "llc";
  const [
    ownershipMembers,
    pendingLlcInvitations,
    distributionHistory,
    pendingChangeRequests,
    pendingWithdrawals,
    financialActivityFeed,
    pendingAccountRenameRequests,
    pendingAccountDeleteRequests
  ] = await Promise.all([
    isLlcAccount && activeAccountId
      ? getOwnershipMembersForAccount(user.id, activeAccountId)
      : Promise.resolve([]),
    isLlcAccount && activeAccountId
      ? getPendingLLCInvitationsForAccount(user.id, activeAccountId)
      : Promise.resolve([]),
    isLlcAccount && activeAccountId
      ? getDistributionHistory(activeAccountId)
      : Promise.resolve([]),
    isLlcAccount && activeAccountId
      ? getPendingChangeRequests(activeAccountId)
      : Promise.resolve([]),
    isLlcAccount && activeAccountId
      ? getPendingWithdrawals(activeAccountId)
      : Promise.resolve([]),
    isLlcAccount && activeAccountId
      ? getFinancialActivityFeed(activeAccountId)
      : Promise.resolve([]),
    ownershipAccounts.length > 0
      ? getPendingAccountRenameRequests(ownershipAccounts.map((account) => account.id))
      : Promise.resolve([]),
    ownershipAccounts.length > 0
      ? getPendingAccountDeleteRequests(ownershipAccounts.map((account) => account.id))
      : Promise.resolve([])
  ]);
  const ownerConnectedMap = await arePropertyOwnersConnected(
    portfolio.properties.map((property) => property.id)
  );
  const isEmpty = portfolio.properties.length === 0 && !initialOwnerWorkflowMode && !initialSectionId;

  return (
    <>
      <StripeTestModeBanner />
      <Dashboard
        data={dashboard}
        portfolio={portfolio}
        isEmpty={isEmpty}
        tickets={tickets}
        invitations={invitations}
        documents={documents}
        notifications={notifications}
        notificationPreferenceSettings={notificationPreferenceSettings}
        announcementProperties={announcementProperties}
        inboxThreads={inboxThreads}
        automationTemplates={automationTemplates}
        automationRules={automationRules}
        listings={listings}
        applications={applications}
        applicationCount={applications.length}
        approvedApplicationCount={approvedApplicationCount}
        gamification={gamification}
        analyticsData={analytics}
        auditLogs={auditLogs}
        rentIncreaseHistory={rentIncreaseHistory}
        vendors={vendors}
        expensesData={expenses}
        managerPaymentConfigs={managerPaymentsData.configs}
        managerPayments={managerPaymentsData.payments}
        managerPaymentManagers={managerPaymentsData.managers}
        managerPaymentsWarning={managerPaymentsData.warning}
        ownershipAccounts={ownershipAccounts}
        ownershipMembers={ownershipMembers}
        llcPayoutMemberships={llcPayoutMemberships}
        pendingLlcInvitations={pendingLlcInvitations}
        pendingAccountRenameRequests={pendingAccountRenameRequests}
        pendingAccountDeleteRequests={pendingAccountDeleteRequests}
        distributionHistory={distributionHistory}
        pendingChangeRequests={pendingChangeRequests}
        pendingWithdrawals={pendingWithdrawals}
        financialActivityFeed={financialActivityFeed}
        newFeedbackCount={newFeedbackCount}
        activeAccountId={activeAccountId}
        currentUserId={user.id}
        capabilities={capabilities}
        initialOwnerWorkflowMode={initialOwnerWorkflowMode}
        initialSectionId={initialSectionId}
        initialPropertyId={initialPropertyId}
        userEmail={user.email ?? "unknown"}
        fullName={profile.fullName}
        nickname={profile.nickname}
        avatarUrl={profile.avatarUrl}
        stripeConnected={profile.stripeOnboardingComplete}
        ownerConnectedMap={ownerConnectedMap}
        onSignOut={signOut}
        onCreateProperty={createProperty}
        onCreatePropertyWithSetup={createPropertyWithSetup}
        onCreateUnit={createUnit}
        onCreateLease={createLease}
        onRenameProperty={renameProperty}
        onUpdateProperty={updatePropertyDetails}
        onDeleteProperty={deleteProperty}
        onUpdateUnitField={updateUnitField}
        onUpdateUnit={updateUnitDetails}
        onDeleteUnit={deleteUnit}
        onUpdateLease={updateLeaseDetails}
        onUpdateRentAmount={updateRentAmount}
        onUpdateTenantDisplayInfo={updateTenantDisplayInfo}
        onUpdateManagerInfo={updateManagerInfo}
        onDeleteLease={deleteLease}
      onRenewLease={renewLease}
      onTerminateLease={terminateLease}
      onCreateTenantActivity={createTenantActivity}
      onGetTenantActivityLog={getTenantActivityLog}
      onPayCharge={payWithCard as (formData: FormData) => Promise<void>}
        onDeletePendingCharge={deletePendingCharge}
        onEditCharge={editCharge}
        onCreateManualCharge={createManualCharge}
        onWaiveCharge={waiveCharge}
        onRecordManualPayment={recordManualPayment}
        onGenerateChargesHref="/owner/generate"
        generatedMessage={generatedMessage}
        onUpdateTicketStatus={updateTicketStatus}
        onAddTicketComment={addTicketComment}
        onInviteTenant={inviteTenant}
        onInviteManager={inviteManager}
        onInviteOwner={inviteOwner}
        onResendInvite={resendInvite}
        onRevokeInvite={revokeInvite}
        onMarkNotificationRead={markNotificationRead}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onResumeNotificationEmails={resumeNotificationEmails}
        onSendBatchPaymentReminder={sendBatchPaymentReminder}
        onCreateAnnouncement={createAnnouncement}
        onGetAnnouncementRecipientCount={getEstimatedRecipientCount}
        onCreateInboxThread={createInboxThread}
        onSendMessageToTenant={sendMessageToTenant}
        onSendInboxMessage={sendInboxMessage}
        onEnableAutomation={enableAutomation}
        onDisableAutomation={disableAutomation}
        onCreateRentalListing={createRentalListing}
        onUpdateListingStatus={updateListingStatus}
        onCreateApplication={createApplication}
        onReviewApplication={reviewApplication}
        onAddApplicationNote={addApplicationNote}
        onRecordScreeningScore={recordScreeningScore}
        onCreateDocumentTemplate={createDocumentTemplate}
        onDeleteDocumentTemplate={deleteDocumentTemplate}
        onCreateDocumentPacket={createDocumentPacket}
        onSendDocumentPacket={sendDocumentPacket}
        onUploadPropertyFile={uploadPropertyFile}
        onDeletePropertyFile={deletePropertyFile}
        onUpdateFileVisibility={updateFileVisibility}
        onCreateVendor={createVendor}
        onUpdateVendor={updateVendor}
        onAssignVendor={assignVendorToTicket}
        onUploadMaintenancePhoto={uploadMaintenancePhoto}
        onDeleteMaintenancePhoto={deleteMaintenancePhoto}
        onCreateExpense={createExpense}
        onUpdateExpense={updateExpense}
        onDeleteExpense={deleteExpense}
        onSetupManagerPaymentConfig={setupManagerPaymentConfig}
        onRecordManagerPayment={recordManagerPayment}
        onMarkManagerPaymentPaid={markManagerPaymentPaid}
        onCancelManagerPayment={cancelManagerPayment}
        onGenerateMonthlyManagerPayments={generateMonthlyManagerPayments}
        onCreateOwnershipAccount={createOwnershipAccount}
        onLinkPropertyToOwnershipAccount={linkPropertyToOwnershipAccount}
        onRenameOwnershipAccount={renameOwnershipAccount}
        onRemoveOwnershipMember={removeOwnershipMember}
        onSendLLCInvitations={sendLLCInvitations}
        onResendLLCInvitation={resendLLCInvitation}
        onCancelLLCInvitation={cancelLLCInvitation}
        onVoteOnAccountRename={voteOnAccountRename}
        onRequestDeleteLLC={requestDeleteLLC}
        onVoteOnDeleteLLC={voteOnDeleteLLC}
        onInitiateAccountStripeConnect={initiateAccountStripeConnect}
        onUpdateDistributionConfig={updateDistributionConfig}
        onSubmitDistributionChangeRequest={submitDistributionChangeRequest}
        onVoteOnDistributionChange={voteOnDistributionChange}
        onInitiateMemberPayoutConnect={initiateMemberPayoutConnect}
        onSubmitWithdrawalRequest={submitWithdrawalRequest}
        onVoteOnWithdrawal={voteOnWithdrawal}
        onInitiatePlaidLink={initiatePlaidLink}
        onCompletePlaidLink={completePlaidLink}
        onRefreshPlaidBalance={refreshPlaidBalance}
        onDisconnectPlaid={disconnectPlaid}
        onExecuteApprovedWithdrawal={executeApprovedWithdrawal}
        onUpdateManagementFee={updateManagementFee}
      />
    </>
  );
}
