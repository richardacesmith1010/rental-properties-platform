import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getGeneratedMessage } from "@/lib/owner";
import { getPortfolioData } from "@/lib/portfolio";
import { getOwnerMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
import { getOwnerDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getOwnerVendors } from "@/lib/vendors";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getOwnerExpenseData } from "@/lib/expenses";
import {
  createCheckoutForCharge,
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
  isTester
} from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface OwnerPageProps {
  searchParams?: {
    generated?: string | string[];
    testerPreview?: string | string[];
    section?: string | string[];
    mode?: string | string[];
  };
}

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const user = await getAuthenticatedUser();
  const testerPreview =
    searchParams?.testerPreview === "true" ||
    (Array.isArray(searchParams?.testerPreview) &&
      searchParams?.testerPreview.includes("true"));
  const [role, testerAccess] = await Promise.all([
    getCurrentUserRole(user.id),
    isTester(user.id)
  ]);

  if (role !== "owner" && !(testerPreview && testerAccess)) {
    redirect(getRoleHomePath(role));
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

  const [dashboard, portfolio, tickets, invitations, documents, notifications, vendors, ownershipAccounts, expenses] = await Promise.all([
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
    capabilities.vendorWorkflowEnabled
      ? getOwnerVendors(user.id)
      : Promise.resolve([]),
    capabilities.ownershipEnabled
      ? getOwnershipAccountsForUser(user.id)
      : Promise.resolve([]),
    getOwnerExpenseData(user.id)
  ]);

  return (
    <Dashboard
      data={dashboard}
      portfolio={portfolio}
      tickets={tickets}
      invitations={invitations}
      documents={documents}
      notifications={notifications}
      vendors={vendors}
      expensesData={expenses}
      ownershipAccounts={ownershipAccounts}
      capabilities={capabilities}
      initialOwnerWorkflowMode={initialOwnerWorkflowMode}
      initialSectionId={initialSectionId}
      userEmail={user.email ?? "unknown"}
      showTesterLink={testerAccess}
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
      onGenerateChargesHref="/owner/generate"
      generatedMessage={generatedMessage}
      onUpdateTicketStatus={updateTicketStatus}
      onInviteTenant={inviteTenant}
      onInviteManager={inviteManager}
      onInviteOwner={inviteOwner}
      onResendInvite={resendInvite}
      onMarkNotificationRead={markNotificationRead}
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
