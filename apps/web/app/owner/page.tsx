import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getGeneratedMessage } from "@/lib/owner";
import { getPortfolioData } from "@/lib/portfolio";
import { getOwnerMaintenanceTickets } from "@/lib/maintenance";
import { getOwnerInvitations } from "@/lib/invitations";
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

  const [dashboard, portfolio, tickets, invitations] = await Promise.all([
    getDashboardData(user.id),
    getPortfolioData(user.id),
    getOwnerMaintenanceTickets(user.id),
    getOwnerInvitations(user.id),
  ]);

  return (
    <Dashboard
      data={dashboard}
      portfolio={portfolio}
      tickets={tickets}
      invitations={invitations}
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
    />
  );
}
