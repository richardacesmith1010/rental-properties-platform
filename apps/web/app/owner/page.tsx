import { Dashboard } from "@/components/dashboard";
import { StripeTestModeBanner } from "@/components/shared/stripe-test-mode-banner";
import {
  createAnnouncement,
  getEstimatedRecipientCount
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
import { getAuthenticatedUser, getRoleHomePath } from "@/lib/auth";
import { getRentCollectionConnectHref } from "@/lib/stripe-connect";
import { redirect } from "next/navigation";
import {
  loadOwnerPageData,
  type OwnerPageSearchParams
} from "./owner-page-data";

export const dynamic = "force-dynamic";

interface OwnerPageProps {
  searchParams?: OwnerPageSearchParams;
}

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const user = await getAuthenticatedUser();
  const ownerPage = await loadOwnerPageData({
    searchParams,
    userEmail: user.email ?? "unknown",
    userId: user.id
  });

  if (ownerPage.status === "role-mismatch") {
    redirect(getRoleHomePath(ownerPage.role));
  }

  if (ownerPage.status === "needs-onboarding") {
    redirect("/onboarding");
  }

  if (ownerPage.status === "needs-setup") {
    redirect("/owner/setup");
  }

  return (
    <>
      <StripeTestModeBanner />
      <Dashboard
        data={ownerPage.dashboard}
        portfolio={ownerPage.portfolio}
        isEmpty={ownerPage.isEmpty}
        tickets={ownerPage.tickets}
        invitations={ownerPage.invitations}
        documents={ownerPage.documents}
        notifications={ownerPage.notifications}
        notificationPreferenceSettings={ownerPage.notificationPreferenceSettings}
        announcementProperties={ownerPage.announcementProperties}
        inboxThreads={ownerPage.inboxThreads}
        automationTemplates={ownerPage.automationTemplates}
        automationRules={ownerPage.automationRules}
        listings={ownerPage.listings}
        applications={ownerPage.applications}
        applicationCount={ownerPage.applicationCount}
        approvedApplicationCount={ownerPage.approvedApplicationCount}
        gamification={ownerPage.gamification}
        analyticsData={ownerPage.analytics}
        auditLogs={ownerPage.auditLogs}
        rentIncreaseHistory={ownerPage.rentIncreaseHistory}
        vendors={ownerPage.vendors}
        expensesData={ownerPage.expenses}
        managerPaymentConfigs={ownerPage.managerPaymentsData?.configs}
        managerPayments={ownerPage.managerPaymentsData?.payments}
        managerPaymentManagers={ownerPage.managerPaymentsData?.managers}
        managerPaymentsWarning={ownerPage.managerPaymentsData?.warning}
        ownershipAccounts={ownerPage.ownershipAccounts}
        ownershipMembers={ownerPage.ownershipMembers}
        llcPayoutMemberships={ownerPage.llcPayoutMemberships}
        pendingLlcInvitations={ownerPage.pendingLlcInvitations}
        pendingAccountRenameRequests={ownerPage.pendingAccountRenameRequests}
        pendingAccountDeleteRequests={ownerPage.pendingAccountDeleteRequests}
        distributionHistory={ownerPage.distributionHistory}
        pendingChangeRequests={ownerPage.pendingChangeRequests}
        pendingWithdrawals={ownerPage.pendingWithdrawals}
        financialActivityFeed={ownerPage.financialActivityFeed}
        newFeedbackCount={ownerPage.newFeedbackCount}
        activeAccountId={ownerPage.activeAccountId}
        currentUserId={user.id}
        capabilities={ownerPage.capabilities}
        initialOwnerHomePage={ownerPage.initialOwnerHomePage}
        initialOwnerWorkflowMode={ownerPage.initialOwnerWorkflowMode}
        initialSectionId={ownerPage.initialSectionId}
        initialPropertyId={ownerPage.initialPropertyId}
        userEmail={user.email ?? "unknown"}
        fullName={ownerPage.profile.fullName}
        nickname={ownerPage.profile.nickname}
        avatarUrl={ownerPage.profile.avatarUrl}
        stripeConnected={ownerPage.profile.stripeOnboardingComplete}
        rentCollectionConnected={ownerPage.rentCollectionStatus.connected}
        rentCollectionConnectHref={getRentCollectionConnectHref(ownerPage.rentCollectionStatus)}
        ownerConnectedMap={ownerPage.ownerConnectedMap}
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
        generatedMessage={ownerPage.generatedMessage}
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
