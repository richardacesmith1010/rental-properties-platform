import Link from "next/link";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredProperties } from "@/lib/property-access";
import { combineHomeMoney, loadHomeAlerts, loadHomeMoney, type MoneyAlert } from "@/lib/home-money";
import { HomeMoneyPage, type HomeMoneyPageData } from "@/components/home-money/home-money-page";
import { resolveMoneySelection } from "./resolve";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { loadCashOnHand } from "@/lib/cash-on-hand";
import { loadPartnerReport, singleSelectedAccount } from "@/lib/partners";
import { loadAccountTasks } from "@/lib/account-tasks";
import { addTask, updateTask, removeTask, markTaskDone, addCommonTasks } from "@/app/actions/account-tasks";
import { logOwnerMoneyLoadFailure, withOneRetry } from "@/lib/retry-transient";
import { addPartner, renamePartner, deactivatePartner,
  addPartnerPayment, updatePartnerPayment, deletePartnerPayment } from "@/app/actions/partners";

export const dynamic = "force-dynamic";

function MoneyStatus({ message }: { message: string }) {
  return <>
    <main className="app-surface min-h-screen p-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]
      pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] lg:pb-5">
      {message}
    </main>
    <OwnerBottomBar />
  </>;
}

export default async function OwnerMoneyPage(props: { searchParams?: Promise<{ property?: string; month?: string; partners?: string }> }) {
  const searchParams = await props.searchParams;
  const { user } = await requireRole(["owner"]);
  const administered = await getAdministeredProperties(user.id);
  const ids = [...new Set(administered.map((property) => property.id))];
  if (!ids.length) return <MoneyStatus message="Add a home to see its money." />;
  const selection = resolveMoneySelection(ids, searchParams?.property, searchParams?.month, new Date());
  const { propertyId: selectedId, selectedMonth, currentMonth: now, range, alertToday } = selection;
  const selectedIds = selectedId ? [selectedId] : ids;
  let results: Array<{ id: string; money: Awaited<ReturnType<typeof loadHomeMoney>>; alerts: MoneyAlert[] }>;
  try {
    results = await withOneRetry("money-alerts", () => Promise.all(selectedIds.map(async (id) => {
      const [money, alerts] = await Promise.all([
        loadHomeMoney(user.id, id, range), loadHomeAlerts(user.id, id, alertToday)
      ]);
      return { id, money, alerts };
    })));
  } catch (error) {
    logOwnerMoneyLoadFailure("money-alerts", error);
    return <MoneyStatus message="Numbers are not ready. Try again later." />;
  }
  let cashAccounts: Awaited<ReturnType<typeof loadCashOnHand>> = [];
  let cashWarning: string | undefined;
  try { cashAccounts = await loadCashOnHand(user.id); }
  catch (error) {
    logOwnerMoneyLoadFailure("cash-on-hand", error);
    cashWarning = isMissingSchemaError(error) ? "This feature requires a database update."
      : "Numbers are not ready. Try again later.";
  }
  const admin = createAdminClient();
  let propertyRows: Array<{ id: string; name: string; owner_account_id: string | null }> | null;
  try {
    propertyRows = await withOneRetry("properties", async () => {
      const { data, error } = await admin.from("properties").select("id, name, owner_account_id").in("id", ids);
      if (error) throw error;
      return data;
    });
  } catch (error) {
    logOwnerMoneyLoadFailure("properties", error);
    return <MoneyStatus message="Numbers are not ready. Try again later." />;
  }
  const partnerAccountId = singleSelectedAccount(propertyRows ?? [], selectedIds);
  const partnerRange = searchParams?.partners === "all" ? "all" as const : range;
  const [partnerResult, tasksResult] = await Promise.all([
    partnerAccountId ? loadPartnerReport(partnerAccountId, partnerRange) : null,
    partnerAccountId ? loadAccountTasks(partnerAccountId) : null
  ]);
  const tasksData = tasksResult?.ok && partnerAccountId ? { accountId: partnerAccountId, ...tasksResult.data,
    onAdd: addTask, onUpdate: updateTask, onRemove: removeTask, onDone: markTaskDone, onCommon: addCommonTasks } : undefined;
  const partnerQuery = `${selectedId ? `property=${encodeURIComponent(selectedId)}&` : ""}month=${selectedMonth}`;
  const partnerData = partnerResult?.ok && partnerAccountId ? {
    accountId: partnerAccountId, report: partnerResult.data,
    period: searchParams?.partners === "all" ? "All time" : selectedMonth === "year"
      ? now.slice(0, 4) : selectedMonth,
    allTimeHref: `/owner/money?${partnerQuery}&partners=all`,
    periodHref: `/owner/money?${partnerQuery}`,
    onAddPartner: addPartner, onRenamePartner: renamePartner,
    onDeactivatePartner: deactivatePartner, onAddPayment: addPartnerPayment,
    onUpdatePayment: updatePartnerPayment, onDeletePayment: deletePartnerPayment
  } : undefined;
  const propertyNames = new Map((propertyRows ?? []).map((property) => [property.id, property.name]));
  const combined = combineHomeMoney(results.filter((result) => result.money).map((result) => result.money!));
  const single = selectedId ? results[0]?.money : null;
  const data: HomeMoneyPageData = {
    property: selectedId ? (single?.property ?? { id: selectedId, name: propertyNames.get(selectedId) ?? "Home" }) : null,
    entries: selectedId ? (single?.entries ?? []) : combined.entries,
    totals: selectedId ? (single?.totals ?? { inCents: 0, outCents: 0, leftCents: 0 }) : combined.totals,
    alerts: results.flatMap((result) => result.alerts.map((alert) => ({
      ...alert, homeName: propertyNames.get(result.id) ?? "Home"
    }))),
    properties: administered.map((property) => ({ id: property.id, name: propertyNames.get(property.id) ?? "Home" }))
  };
  const months = [0, 1].map((offset) => {
    const date = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5)) - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return <>
    <main className="app-surface min-h-screen px-4 pb-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] text-[var(--ink)] lg:pt-5 lg:pb-5
      pb-[calc(env(safe-area-inset-bottom,0px)+10rem)]">
      <div className="mx-auto max-w-[720px]">
    <Link href="/owner" className="hidden min-h-11 items-center text-sm text-[var(--muted)] lg:inline-flex">← Home</Link>
        <HomeMoneyPage cashAccounts={cashAccounts} cashWarning={cashWarning} data={data}
          selectedMonth={selectedMonth} months={months} partnerData={partnerData} tasksData={tasksData}
          tasksWarning={tasksResult && !tasksResult.ok && tasksResult.error === "unavailable"
            ? "This feature requires a database update." : undefined}
          partnerWarning={partnerResult && !partnerResult.ok && partnerResult.error === "unavailable"
            ? "This feature requires a database update." : undefined} />
      </div>
    </main>
    <OwnerBottomBar />
  </>;
}
