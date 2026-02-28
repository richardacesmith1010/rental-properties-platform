import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { getManagerDashboardData } from "@/lib/manager-dashboard";
import { getManagerVendors } from "@/lib/vendors";
import { signOut, updateTicketStatus, assignVendorToTicket, uploadMaintenancePhoto } from "@/app/actions";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const { user } = await requireRole(["manager"]);
  const [data, vendors] = await Promise.all([
    getManagerDashboardData(user.id),
    getManagerVendors(user.id)
  ]);

  return (
    <ManagerDashboard
      data={data}
      vendors={vendors}
      userEmail={user.email ?? "unknown"}
      onSignOut={signOut}
      onUpdateTicketStatus={updateTicketStatus}
      onAssignVendor={assignVendorToTicket}
      onUploadPhoto={uploadMaintenancePhoto}
    />
  );
}
