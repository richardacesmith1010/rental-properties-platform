import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getClientDetail } from "@/lib/client-overview";
import { createClientAccount } from "@/app/actions/client-accounts";
import { createPropertyWithSetup } from "@/app/actions/unified-setup";
import { defaultStatementMonth, statementMonthOptions } from "@/lib/statement-month";
import { ClientDetail } from "@/components/dashboard/clients/client-detail";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { user } = await requireRole(["manager"]);
  const { accountId } = await params;
  const detail = await getClientDetail(user.id, accountId);
  if (!detail) notFound();
  return <ClientDetail client={detail} defaultMonth={defaultStatementMonth()} monthOptions={statementMonthOptions()} onCreatePropertyWithSetup={createPropertyWithSetup}
    onCreateClientAccount={createClientAccount} />;
}
