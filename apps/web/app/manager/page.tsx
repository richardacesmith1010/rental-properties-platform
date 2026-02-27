import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { getManagerDashboardData } from "@/lib/manager-dashboard";
import { signOut, updateTicketStatus } from "@/app/actions";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const { user } = await requireRole(["manager"]);
  const data = await getManagerDashboardData(user.id);

  return (
    <ManagerDashboard
      data={data}
      userEmail={user.email ?? "unknown"}
      onSignOut={signOut}
      onUpdateTicketStatus={updateTicketStatus}
    />
  );
}
