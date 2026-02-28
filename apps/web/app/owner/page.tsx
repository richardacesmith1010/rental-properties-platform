import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getGeneratedMessage } from "@/lib/owner";
import { getPortfolioData } from "@/lib/portfolio";
import { getOwnerMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
import { getOwnerDocumentsData } from "@/lib/documents";
import { getNotificationsForUser } from "@/lib/notifications";
import { getOwnerVendors } from "@/lib/vendors";
import {
  createCheckoutForCharge,
  createLease,
  createProperty,
  createUnit,
  signOut,
  updateTicketStatus,
  inviteTenant,
  inviteManager,
  resendInvite,
  markNotificationRead,
  createDocumentTemplate,
  deleteDocumentTemplate,
  createDocumentPacket,
  sendDocumentPacket,
  createVendor,
  assignVendorToTicket,
  uploadMaintenancePhoto,
} from "@/app/actions";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface OwnerPageProps {
  searchParams?: {
    generated?: string | string[];
  };
}

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const { user } = await requireRole(["owner"]);
  const generatedMessage = getGeneratedMessage(searchParams?.generated);

  const [dashboard, portfolio, tickets, invitations, documents, notifications, vendors] = await Promise.all([
    getDashboardData(user.id),
    getPortfolioData(user.id),
    getOwnerMaintenanceTickets(user.id),
    getOwnerInvitations(user.id),
    getOwnerDocumentsData(user.id),
    getNotificationsForUser(user.id),
    getOwnerVendors(user.id)
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
      userEmail={user.email ?? "unknown"}
      onSignOut={signOut}
      onCreateProperty={createProperty}
      onCreateUnit={createUnit}
      onCreateLease={createLease}
      onPayCharge={createCheckoutForCharge}
      onGenerateChargesHref="/owner/generate"
      generatedMessage={generatedMessage}
      onUpdateTicketStatus={updateTicketStatus}
      onInviteTenant={inviteTenant}
      onInviteManager={inviteManager}
      onResendInvite={resendInvite}
      onMarkNotificationRead={markNotificationRead}
      onCreateDocumentTemplate={createDocumentTemplate}
      onDeleteDocumentTemplate={deleteDocumentTemplate}
      onCreateDocumentPacket={createDocumentPacket}
      onSendDocumentPacket={sendDocumentPacket}
      onCreateVendor={createVendor}
      onAssignVendor={assignVendorToTicket}
      onUploadMaintenancePhoto={uploadMaintenancePhoto}
    />
  );
}
