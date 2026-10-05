import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { getAdministeredProperties } from "@/lib/property-access";
import { loadHomeAlerts, loadHomeMoney } from "@/lib/home-money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function currentMonth() {
  const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { month: from.toISOString().slice(0, 7), from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10), today: now.toISOString().slice(0, 10) };
}

export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Authentication required." }, 401);
    if (await getCurrentUserRole(user.id) !== "owner") return json({ error: "Owner access required." }, 403);
    const params = new URL(request.url).searchParams;
    const seen = new Set<string>();
    for (const key of params.keys()) {
      if (key !== "account" || seen.has(key)) return json({ error: "Invalid home money request." }, 400);
      seen.add(key);
    }
    const administered = await getAdministeredProperties(user.id); const requestedAccount = params.get("account");
    const accountIds = [...new Set(administered.map((property) => property.ownerAccountId))];
    const chosenAccount = requestedAccount && accountIds.includes(requestedAccount) ? requestedAccount : accountIds[0];
    const selected = administered.filter((property) => property.ownerAccountId === chosenAccount);
    const admin = createAdminClient();
    const { data: properties, error: propertiesError } = selected.length
      ? await admin.from("properties").select("id, name").in("id", selected.map((property) => property.id)).order("name")
      : { data: [], error: null };
    if (propertiesError) throw new Error("Home money data unavailable.");
    const propertyRows = properties ?? []; const range = currentMonth();
    const homes = await Promise.all(propertyRows.slice(0, 3).map(async (property) => {
      const [money, alerts] = await Promise.all([
        loadHomeMoney(user.id, property.id, range), loadHomeAlerts(user.id, property.id, range.today)
      ]);
      return { propertyId: property.id, name: property.name, inCents: money?.totals.inCents ?? 0,
        outCents: money?.totals.outCents ?? 0,
        leftCents: money?.totals.leftCents ?? 0, alertCount: alerts.length };
    }));
    return json({ month: range.month, homes, moreCount: Math.max(0, propertyRows.length - 3) });
  } catch {
    return json({ error: "Unable to load home money." }, 500);
  }
}
