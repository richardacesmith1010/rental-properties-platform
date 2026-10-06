import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredProperties } from "@/lib/property-access";
import { loadHomeAlerts, loadHomeMoney } from "@/lib/home-money";
import { HomeMoneyPage, type HomeMoneyPageData } from "@/components/home-money/home-money-page";
import { resolveMoneySelection } from "./resolve";

export const dynamic = "force-dynamic";

export default async function OwnerMoneyPage(props: { searchParams?: Promise<{ property?: string; month?: string }> }) {
  const searchParams = await props.searchParams;
  const { user } = await requireRole(["owner"]);const administered = await getAdministeredProperties(user.id);
  const ids = administered.map((property) => property.id);
  if (!ids.length) return <main className="app-surface min-h-screen p-5">Add a home to see its money.</main>;
  const selection = resolveMoneySelection(ids, searchParams?.property, searchParams?.month, new Date());
  const { propertyId: selectedId, selectedMonth, currentMonth: now, range, alertToday } = selection;
  let money: Awaited<ReturnType<typeof loadHomeMoney>>;
  let alerts: Awaited<ReturnType<typeof loadHomeAlerts>>;
  try {
    [money, alerts] = await Promise.all([
      loadHomeMoney(user.id, selectedId, range), loadHomeAlerts(user.id, selectedId, alertToday)
    ]);
  } catch {
    return <main className="app-surface min-h-screen p-5">Numbers are not ready. Try again later.</main>;
  }
  const admin = createAdminClient();
  const { data: propertyRows, error: propertiesError } = await admin.from("properties").select("id, name").in("id", ids);
  if (propertiesError) {
    return <main className="app-surface min-h-screen p-5">Numbers are not ready. Try again later.</main>;
  }
  const propertyNames = new Map((propertyRows ?? []).map((property) => [property.id, property.name]));
  const data: HomeMoneyPageData = {
    property: money?.property ?? { id: selectedId, name: propertyNames.get(selectedId) ?? "Home" },
    entries: money?.entries ?? [],
    totals: money?.totals ?? { inCents: 0, outCents: 0, leftCents: 0 }, alerts,
    properties: administered.map((property) => ({ id: property.id, name: propertyNames.get(property.id) ?? "Home" }))
  };
  const months = [0, 1, 2].map((offset) => {
    const date = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5)) - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return <main className="app-surface min-h-screen px-4 py-5 text-[var(--ink)]"><div className="mx-auto max-w-5xl">
    <Link href="/owner" className="inline-flex min-h-11 items-center text-sm text-[var(--muted)]">← Home</Link>
    <HomeMoneyPage data={data} selectedMonth={selectedMonth} months={months} /></div></main>;
}
