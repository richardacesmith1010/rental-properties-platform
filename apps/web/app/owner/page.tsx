import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getGeneratedMessage } from "@/lib/format";
import { getPortfolioData } from "@/lib/portfolio";
import { getOwnerMaintenanceTickets } from "@/lib/maintenance";
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
import {
  createCheckoutForCharge,
  recordManualPayment,
  createLease,
  updateLease,
  deleteLease,
  createProperty,
  updateProperty,
  deleteProperty,
  createUnit,
  updateUnit,
  deleteUnit,
  signOut,
  updateTicketStatus,
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
  linkPropertyToOwnershipAccount
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
    gamification
  ] = await Promise.all([
    getDashboardData(user.id),
    getPortfolioData(user.id),
    getOwnerMaintenanceTickets(user.id),
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
      ? getOwnerVendors(user.id)
      : Promise.resolve([]),
    getOwnerExpenseData(user.id),
    getUserGamification(user.id)
  ]);

  const approvedApplicationCount = applications.filter(
    (application) => application.status === "approved"
  ).length;
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
      vendors={vendors}
      expensesData={expenses}
      ownershipAccounts={ownershipAccounts}
      capabilities={capabilities}
      initialOwnerWorkflowMode={initialOwnerWorkflowMode}
      initialSectionId={initialSectionId}
      userEmail={user.email ?? "unknown"}
      fullName={profile.fullName}
      nickname={profile.nickname}
      avatarUrl={profile.avatarUrl}
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
      onPayCharge={createCheckoutForCharge}
      onRecordManualPayment={recordManualPayment}
      onGenerateChargesHref="/owner/generate"
      generatedMessage={generatedMessage}
      onUpdateTicketStatus={updateTicketStatus}
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
    />
  );
}
