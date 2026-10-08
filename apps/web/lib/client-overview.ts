import "server-only";

import { isActiveClientManager } from "@/lib/client-accounts";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClientHome = {
  id: string;
  name: string;
  address: string;
  status: "overdue" | "paid" | "due" | "no_tenant";
  dueLabel?: string;
  dueDate?: string;
};
export type ClientOverview = {
  id: string;
  name: string;
  accountType: "individual" | "llc";
  contactEmail: string | null;
  homeCount: number;
  summary: string;
};
export type ClientDetail = Omit<ClientOverview, "homeCount" | "summary"> & { homes: ClientHome[] };

type AccountRow = { id: string; display_name: string; account_type: "individual" | "llc"; client_contact_email: string | null; managed_client: boolean };
type PropertyRow = { id: string; owner_account_id: string; name: string; address_line1: string; city: string; state: string; postal_code: string; active: boolean };
type UnitRow = { id: string; property_id: string };
type LeaseRow = { id: string; unit_id: string; active: boolean; due_day_of_month?: number };
type RentRow = { lease_id: string; due_date: string; status: string };

function todayInZone(now: Date, zone = "America/Denver") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
}
function dueLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function getHomeStatus(leases: LeaseRow[], rents: RentRow[], now = new Date()): Pick<ClientHome, "status" | "dueLabel" | "dueDate"> {
  if (!leases.length) return { status: "no_tenant" };
  const today = todayInZone(now);
  const currentMonth = today.slice(0, 7);
  const leaseIds = new Set(leases.map((lease) => lease.id));
  const relevant = rents.filter((rent) => leaseIds.has(rent.lease_id));
  if (relevant.some((rent) => ["pending", "late"].includes(rent.status) && rent.due_date < today)) return { status: "overdue" };
  if (relevant.some((rent) => rent.status === "paid" && rent.due_date.startsWith(currentMonth))) return { status: "paid" };
  const next = relevant.filter((rent) => ["pending", "late"].includes(rent.status) && rent.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (next) return { status: "due", dueLabel: dueLabel(next.due_date), dueDate: next.due_date };
  const date = new Date(`${today}T12:00:00Z`);
  const dueDay = Math.min(28, Math.max(1, leases[0].due_day_of_month ?? 1));
  const pastDueDay = date.getUTCDate() > dueDay;
  date.setUTCDate(1);
  if (pastDueDay) date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(dueDay);
  const nextDueDate = date.toISOString().slice(0, 10);
  return { status: "due", dueLabel: dueLabel(nextDueDate), dueDate: nextDueDate };
}

export function summarizeClientHomes(homes: ClientHome[]) {
  const overdue = homes.filter((home) => home.status === "overdue").length;
  if (overdue) return `${overdue} rent overdue`;
  const leased = homes.filter((home) => home.status !== "no_tenant");
  if (leased.length && leased.every((home) => home.status === "paid")) return "All rent paid this month";
  const due = homes.filter((home) => home.status === "due")
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"))[0];
  return due ? `Rent due ${due.dueLabel}` : "No tenants yet";
}

async function load(managerId: string, accountId?: string) {
  const admin = createAdminClient();
  const { data: links, error: linksError } = await admin.from("ownership_account_managers")
    .select("account_id").eq("manager_profile_id", managerId).eq("active", true);
  if (linksError) throw linksError;
  const ids = [...new Set((links ?? []).map((link) => link.account_id))]
    .filter((id) => !accountId || id === accountId);
  if (!ids.length) return [];
  const { data: rawAccounts, error: accountError } = await admin.from("ownership_accounts")
    .select("id, display_name, account_type, client_contact_email, managed_client").in("id", ids);
  if (accountError) throw accountError;
  const accounts = (rawAccounts ?? [] as AccountRow[]).filter((account) => account.managed_client) as AccountRow[];
  if (!accounts.length) return [];
  const accountIds = accounts.map((account) => account.id);
  const { data: rawProperties, error: propertyError } = await admin.from("properties")
    .select("id, owner_account_id, name, address_line1, city, state, postal_code, active")
    .in("owner_account_id", accountIds);
  if (propertyError) throw propertyError;
  const properties = ((rawProperties ?? []) as PropertyRow[]).filter((property) => property.active !== false);
  const propertyIds = properties.map((property) => property.id);
  let units: UnitRow[] = [];
  let leases: LeaseRow[] = [];
  let rents: RentRow[] = [];
  if (propertyIds.length) {
    const { data, error } = await admin.from("units").select("id, property_id").in("property_id", propertyIds);
    if (error) throw error;
    units = (data ?? []) as UnitRow[];
  }
  if (units.length) {
    const { data, error } = await admin.from("leases").select("id, unit_id, active, due_day_of_month")
      .in("unit_id", units.map((unit) => unit.id)).eq("active", true);
    if (error) throw error;
    leases = (data ?? []) as LeaseRow[];
  }
  if (leases.length) {
    const { data, error } = await admin.from("rent_charges").select("lease_id, due_date, status")
      .in("lease_id", leases.map((lease) => lease.id));
    if (error) throw error;
    rents = (data ?? []) as RentRow[];
  }
  const unitsByProperty = new Map<string, string[]>();
  for (const unit of units) unitsByProperty.set(unit.property_id, [...(unitsByProperty.get(unit.property_id) ?? []), unit.id]);
  return accounts.map((account) => {
    const homes = properties.filter((property) => property.owner_account_id === account.id).map((property) => {
      const unitIds = new Set(unitsByProperty.get(property.id) ?? []);
      const activeLeases = leases.filter((lease) => unitIds.has(lease.unit_id));
      return {
        id: property.id, name: property.name,
        address: [property.address_line1, property.city, property.state, property.postal_code].filter(Boolean).join(", "),
        ...getHomeStatus(activeLeases, rents)
      } satisfies ClientHome;
    });
    return { id: account.id, name: account.display_name, accountType: account.account_type,
      contactEmail: account.client_contact_email, homeCount: homes.length, summary: summarizeClientHomes(homes), homes };
  });
}

export async function getClientsOverview(managerId: string): Promise<ClientOverview[]> {
  return (await load(managerId)).map(({ homes: _homes, ...overview }) => overview);
}

export async function getClientDetail(managerId: string, accountId: string): Promise<ClientDetail | null> {
  if (!(await isActiveClientManager(managerId, accountId))) return null;
  const result = (await load(managerId, accountId))[0];
  if (!result) return null;
  const { homeCount: _homeCount, summary: _summary, ...detail } = result;
  return detail;
}
