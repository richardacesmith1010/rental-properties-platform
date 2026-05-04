import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getPortfolioData } from "@/lib/portfolio";
import { getAdminMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
import { getOwnerDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getAutomationRulesForUser, getAutomationTemplates } from "@/lib/automations";
import { getInboxThreadsForUser } from "@/lib/inbox";
import { getRentalListingsForUser } from "@/lib/leasing";
import { getApplicationsForUser, type ApplicationDTO } from "@/lib/applications";
import { getManagerVendors } from "@/lib/vendors";
import { getOwnerExpenseData } from "@/lib/expenses";
import { getOwnerAnalyticsData } from "@/lib/analytics";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import {
  getActiveLlcMembershipsForUser,
  getOwnershipAccountsForUser
} from "@/lib/ownership";
import { getUserGamification } from "@/lib/gamification";
import { getRecentAuditLogs } from "@/lib/audit";
import { getRentIncreaseHistory } from "@/lib/rent-increases";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import {
  payWithCard,
  createTenantActivity,
  getTenantActivityLog,
  createManualCharge,
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
  deleteProperty,
  createUnit,
  deleteUnit,
  signOut,
  updateTicketStatus,
  addTicketComment,
  inviteTenant,
  inviteManager,
  inviteOwner,
  resendInvite,
  revokeInvite,
  markNotificationRead,
  markAllNotificationsRead,
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
  createExpense,
  updateExpense,
  deleteExpense,
  createVendor,
  updateVendor,
  assignVendorToTicket,
  uploadMaintenancePhoto,
  deleteMaintenancePhoto,
  createOwnershipAccount,
  linkPropertyToOwnershipAccount
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
  getAuthenticatedUser,
  getCurrentUserRole,
  getRoleHomePath,
  getUserProfileSummary
} from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface ManagerPageProps {
  searchParams?: {
    generated?: string | string[];
    section?: string | string[];
    mode?: string | string[];
    property?: string | string[];
  };
}

function getGeneratedMessage(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (role !== "manager") {
    redirect(getRoleHomePath(role));
  }

  const profile = await getUserProfileSummary(user.id);
  if (!profile.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const capabilities = await getFeatureCapabilities();
  const generatedMessage = getGeneratedMessage(searchParams?.generated);
  const managerMode =
    typeof searchParams?.mode === "string"
      ? searchParams.mode
      : Array.isArray(searchParams?.mode)
        ? searchParams.mode[0] ?? null
        : null;
  const initialManagerWorkflowMode =
    managerMode === "daily_ops" ||
    managerMode === "new_property" ||
    managerMode === "new_tenant" ||
    managerMode === "vendor_ops"
      ? managerMode
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
    tickets,
    invitations,
    documents,
    notifications,
    inboxThreads,
    automationTemplates,
    automationRules,
    listings,
    applications,
    vendors,
    ownershipAccounts,
    llcPayoutMemberships,
    gamification,
    expenses,
    analytics,
    auditLogs,
    rentIncreaseHistory
  ] =
    await Promise.all([
      getDashboardData(user.id),
      getPortfolioData(user.id),
      getAdminMaintenanceTickets(user.id),
      getOwnerInvitations(user.id),
      capabilities.documentsEnabled
        ? getOwnerDocumentsData(user.id)
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
        ? getRentalListingsForUser(user.id)
        : Promise.resolve([]),
      capabilities.leasingPipelineEnabled
        ? getApplicationsForUser(user.id)
        : Promise.resolve([] as ApplicationDTO[]),
      capabilities.vendorWorkflowEnabled
        ? getManagerVendors(user.id)
        : Promise.resolve([]),
      capabilities.ownershipEnabled
        ? getOwnershipAccountsForUser(user.id)
        : Promise.resolve([]),
      getActiveLlcMembershipsForUser(user.id),
      getUserGamification(user.id),
      getOwnerExpenseData(user.id),
      getOwnerAnalyticsData(user.id),
      getRecentAuditLogs(user.id),
      getRentIncreaseHistory(user.id)
    ]);

  const approvedApplicationCount = applications.filter(
    (application) => application.status === "approved"
  ).length;
  const ownerConnectedMap = await arePropertyOwnersConnected(
    portfolio.properties.map((property) => property.id)
  );

  return (
    <Dashboard
      data={dashboard}
      portfolio={portfolio}
      tickets={tickets}
      invitations={invitations}
      documents={documents}
      notifications={notifications}
      inboxThreads={inboxThreads}
      automationTemplates={automationTemplates}
      automationRules={automationRules}
      listings={listings}
      applications={applications}
      applicationCount={applications.length}
      approvedApplicationCount={approvedApplicationCount}
      gamification={gamification}
      vendors={vendors}
      ownershipAccounts={ownershipAccounts}
      llcPayoutMemberships={llcPayoutMemberships}
      expensesData={expenses}
      analyticsData={analytics}
      auditLogs={auditLogs}
      rentIncreaseHistory={rentIncreaseHistory}
      currentUserId={user.id}
      capabilities={capabilities}
      initialManagerWorkflowMode={initialManagerWorkflowMode}
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
      onCreateUnit={createUnit}
      onCreateLease={createLease}
      onUpdateProperty={updatePropertyDetails}
      onDeleteProperty={deleteProperty}
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
      onCreateOwnershipAccount={createOwnershipAccount}
      onLinkPropertyToOwnershipAccount={linkPropertyToOwnershipAccount}
      onCreateExpense={createExpense}
      onUpdateExpense={updateExpense}
      onDeleteExpense={deleteExpense}
    />
  );
}
