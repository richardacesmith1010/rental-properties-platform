import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getGeneratedMessage } from "@/lib/format";
import { getPortfolioData } from "@/lib/portfolio";
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
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getOwnerExpenseData } from "@/lib/expenses";
import { getUserGamification } from "@/lib/gamification";
import { getOwnerAnalyticsData } from "@/lib/analytics";
import { getRecentAuditLogs } from "@/lib/audit";
import { getRentIncreaseHistory } from "@/lib/rent-increases";
import { arePropertyOwnersConnected } from "@/lib/stripe-connect";
import {
  initiateAccountStripeConnect,
  createCheckoutForCharge,
  recordManualPayment,
  createLease,
  updateLease,
  deleteLease,
  renewLease,
  terminateLease,
  createProperty,
  updateProperty,
  deleteProperty,
  createUnit,
  updateUnit,
  deleteUnit,
  signOut,
  updateTicketStatus,
  addTicketComment,
  inviteTenant,
  inviteManager,
  inviteOwner,
  resendInvite,
  markNotificationRead,
  markAllNotificationsRead,
  createInboxThread,
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
  createExpense,
  updateExpense,
  deleteExpense,
  createOwnershipAccount,
  linkPropertyToOwnershipAccount,
  updateManagementFee
} from "@/app/actions";
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
    expenses,
    gamification,
    analytics,
    auditLogs,
    rentIncreaseHistory
  ] = await Promise.all([
    getDashboardData(user.id, activeAccountId),
    getPortfolioData(user.id, activeAccountId),
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
    getUserGamification(user.id),
    getOwnerAnalyticsData(user.id, activeAccountId),
    getRecentAuditLogs(user.id, activeAccountId),
    getRentIncreaseHistory(user.id, activeAccountId)
  ]);

  const approvedApplicationCount = applications.filter(
    (application) => application.status === "approved"
  ).length;
  const ownerConnectedMap = await arePropertyOwnersConnected(
    portfolio.properties.map((property) => property.id)
  );
  const isEmpty = portfolio.properties.length === 0 && !initialOwnerWorkflowMode && !initialSectionId;

  return (
    <Dashboard
      data={dashboard}
      portfolio={portfolio}
      isEmpty={isEmpty}
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
      analyticsData={analytics}
      auditLogs={auditLogs}
      rentIncreaseHistory={rentIncreaseHistory}
      vendors={vendors}
      expensesData={expenses}
      ownershipAccounts={ownershipAccounts}
      activeAccountId={activeAccountId}
      capabilities={capabilities}
      initialOwnerWorkflowMode={initialOwnerWorkflowMode}
      initialSectionId={initialSectionId}
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
      onUpdateProperty={updateProperty}
      onDeleteProperty={deleteProperty}
      onUpdateUnit={updateUnit}
      onDeleteUnit={deleteUnit}
      onUpdateLease={updateLease}
      onDeleteLease={deleteLease}
      onRenewLease={renewLease}
      onTerminateLease={terminateLease}
      onPayCharge={createCheckoutForCharge as (formData: FormData) => Promise<void>}
      onRecordManualPayment={recordManualPayment}
      onGenerateChargesHref="/owner/generate"
      generatedMessage={generatedMessage}
      onUpdateTicketStatus={updateTicketStatus}
      onAddTicketComment={addTicketComment}
      onInviteTenant={inviteTenant}
      onInviteManager={inviteManager}
      onInviteOwner={inviteOwner}
      onResendInvite={resendInvite}
      onMarkNotificationRead={markNotificationRead}
      onMarkAllNotificationsRead={markAllNotificationsRead}
      onCreateInboxThread={createInboxThread}
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
      onCreateExpense={createExpense}
      onUpdateExpense={updateExpense}
      onDeleteExpense={deleteExpense}
      onCreateOwnershipAccount={createOwnershipAccount}
      onLinkPropertyToOwnershipAccount={linkPropertyToOwnershipAccount}
      onInitiateAccountStripeConnect={initiateAccountStripeConnect}
      onUpdateManagementFee={updateManagementFee}
    />
  );
}
