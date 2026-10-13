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
import { getMonthlyLeaseLedgers } from "@/lib/reports-ledger";
import { MonthlyLeaseLedgerCard } from "@/components/reports/monthly-lease-ledger";

export const dynamic = "force-dynamic";

interface OwnerPropertyDetailPageProps {
  params: Promise<{
    propertyId: string;
  }>;
}

export default async function OwnerPropertyDetailPage(props: OwnerPropertyDetailPageProps) {
  const params = await props.params;
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
  const monthlyLedgers = await getMonthlyLeaseLedgers(data.leases.filter((lease) => lease.active)
    .map((lease) => lease.id));

  return (
    <><PropertyDetailView
      data={data}
      role="owner"
      onCreateTenantActivity={createTenantActivity}
      onGetTenantActivityLog={getTenantActivityLog}
      onSendMessageToTenant={sendMessageToTenant}
      onAddTicketComment={addTicketComment}
      onUpdateTicketStatus={updateTicketStatus}
    />
    <div className="app-surface space-y-4 px-4 pb-6 sm:px-6">
      {[...monthlyLedgers].map(([leaseId, ledger]) =>
        <MonthlyLeaseLedgerCard key={leaseId} data={ledger} />)}
    </div></>
  );
}
