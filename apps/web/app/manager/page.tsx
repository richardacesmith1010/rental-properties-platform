import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { getManagerDashboardData } from "@/lib/manager-dashboard";
import { getManagerVendors } from "@/lib/vendors";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { signOut, updateTicketStatus, assignVendorToTicket, uploadMaintenancePhoto } from "@/app/actions";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const { user } = await requireRole(["manager"]);
  const capabilities = await getFeatureCapabilities();
  const [data, vendors] = await Promise.all([
    getManagerDashboardData(user.id),
    capabilities.vendorWorkflowEnabled ? getManagerVendors(user.id) : Promise.resolve([])
  ]);

  return (
    <ManagerDashboard
      data={data}
      vendors={vendors}
      capabilities={capabilities}
      userEmail={user.email ?? "unknown"}
      onSignOut={signOut}
      onUpdateTicketStatus={updateTicketStatus}
      onAssignVendor={assignVendorToTicket}
      onUploadPhoto={uploadMaintenancePhoto}
    />
  );
}
