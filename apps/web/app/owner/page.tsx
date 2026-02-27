import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard";
import { getPortfolioData } from "@/lib/portfolio";
import { getOwnerMaintenanceTickets } from "@/lib/maintenance";
import {
  createCheckoutForCharge,
  createLease,
  createProperty,
  createUnit,
  signOut,
  updateTicketStatus,
} from "@/app/actions";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const { user } = await requireRole(["owner"]);

  const [dashboard, portfolio, tickets] = await Promise.all([
    getDashboardData(user.id),
    getPortfolioData(user.id),
    getOwnerMaintenanceTickets(user.id),
  ]);

  return (
    <Dashboard
      data={dashboard}
      portfolio={portfolio}
      tickets={tickets}
      userEmail={user.email ?? "unknown"}
      onSignOut={signOut}
      onCreateProperty={createProperty}
      onCreateUnit={createUnit}
      onCreateLease={createLease}
      onPayCharge={createCheckoutForCharge}
      onUpdateTicketStatus={updateTicketStatus}
    />
  );
}
