import { redirect } from "next/navigation";
import {
  addTicketComment,
  createTenantActivity,
  getTenantActivityLog,
  sendMessageToTenant,
  updateTicketStatus
} from "@/app/actions";
import { PropertyDetailView } from "@/components/dashboard/property-detail-view";
import { requireRole, getUserProfileSummary } from "@/lib/auth";
import { getPropertyDetailData } from "@/lib/property-detail";

export const dynamic = "force-dynamic";

interface OwnerPropertyDetailPageProps {
  params: {
    propertyId: string;
  };
}

export default async function OwnerPropertyDetailPage({
  params
}: OwnerPropertyDetailPageProps) {
  const { user } = await requireRole(["owner"]);
  const profile = await getUserProfileSummary(user.id);
  if (!profile.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const data = await getPropertyDetailData(params.propertyId, user.id);
  if (!data) {
    redirect(
      "/owner?generated=Property%20details%20are%20not%20available%20for%20that%20address."
    );
  }

  return (
    <PropertyDetailView
      data={data}
      role="owner"
      onCreateTenantActivity={createTenantActivity}
      onGetTenantActivityLog={getTenantActivityLog}
      onSendMessageToTenant={sendMessageToTenant}
      onAddTicketComment={addTicketComment}
      onUpdateTicketStatus={updateTicketStatus}
    />
  );
}
