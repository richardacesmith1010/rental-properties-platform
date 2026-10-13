import "server-only";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BankRow, BankRule, BankCharge, BankProperty, TransferLeg } from "./types";
type Admin = ReturnType<typeof createAdminClient>;
export async function loadMatching(admin: Admin, ownerAccountId: string, bankAccountId: string,
  rows: BankRow[]): Promise<{ rules: BankRule[]; fingerprints: Set<string>; charges: BankCharge[];
    properties: BankProperty[]; legs: TransferLeg[] } | null> {
  const earliest = rows.reduce((date, row) => row.postedOn < date ? row.postedOn : date, rows[0].postedOn);
  const latest = rows.reduce((date, row) => row.postedOn > date ? row.postedOn : date, rows[0].postedOn);
  const from = new Date(Date.parse(earliest + "T00:00:00Z") - 45 * 86_400_000).toISOString().slice(0, 10);
  const after = new Date(Date.parse(latest + "T00:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10);
  const legsThrough = new Date(Date.parse(latest + "T00:00:00Z") + 5 * 86_400_000).toISOString().slice(0, 10);
  const before = new Date(Date.parse(earliest + "T00:00:00Z") - 7 * 86_400_000).toISOString().slice(0, 10);
  const [rulesQuery, propertiesQuery, accountsQuery] = await Promise.all([
    admin.from("bank_rules").select("*").eq("owner_account_id", ownerAccountId),
    admin.from("properties").select("id, name").eq("owner_account_id", ownerAccountId).eq("active", true),
    admin.from("bank_accounts").select("id").eq("owner_account_id", ownerAccountId)
  ]);
  if (rulesQuery.error || propertiesQuery.error || accountsQuery.error) return null;
  const properties = (propertiesQuery.data || []) as BankProperty[];
  const propertyIds = properties.map((item) => item.id);
  const bankIds = (accountsQuery.data || []).map((item) => item.id);
  const [unitsQuery, legsQuery] = await Promise.all([
    propertyIds.length ? admin.from("units").select("id, property_id").in("property_id", propertyIds).eq("active", true)
      : Promise.resolve({ data: [], error: null }), bankIds.length ? admin.from("bank_transactions")
      .select("bank_account_id, posted_on, amount_cents, direction, kind")
      .in("bank_account_id", bankIds).in("kind", ["rent", "transfer"]).gte("posted_on", from).lte("posted_on", legsThrough)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (unitsQuery.error || legsQuery.error) return null;
  const units = unitsQuery.data || [];
  const unitIds = units.map((item) => item.id);
  const leasesQuery = unitIds.length ? await admin.from("leases")
    .select("id, unit_id, tenant_profile_id").in("unit_id", unitIds).eq("active", true)
    : { data: [], error: null };
  if (leasesQuery.error) return null;
  const leases = leasesQuery.data || [];
  const leaseIds = leases.map((item) => item.id);
  const tenantIds = [...new Set(leases.map((item) => item.tenant_profile_id))];
  const [chargesQuery, profilesQuery] = await Promise.all([
    leaseIds.length ? admin.from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, status")
      .in("lease_id", leaseIds).is("deleted_at", null).gte("due_date", before).lte("due_date", after)
      : Promise.resolve({ data: [], error: null }), tenantIds.length ? admin.from("profiles").select("id, full_name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (chargesQuery.error || profilesQuery.error) return null;
  const unitMap = new Map(units.map((item) => [item.id, item.property_id]));
  const leaseMap = new Map(leases.map((item) => [item.id, item]));
  const propertyMap = new Map(properties.map((item) => [item.id, item.name]));
  const profileMap = new Map((profilesQuery.data || []).map((item) => [item.id, item.full_name]));
  const charges: BankCharge[] = (chargesQuery.data || []).flatMap((item) => {
    const lease = leaseMap.get(item.lease_id);
    const propertyId = lease ? unitMap.get(lease.unit_id) : null;
    if (!lease || !propertyId) return [];
    return [{ id: item.id, leaseId: item.lease_id, propertyId, propertyName: propertyMap.get(propertyId) || "Home",
      tenantName: profileMap.get(lease.tenant_profile_id) || "Tenant", dueDate: item.due_date,
      amountCents: item.amount_cents, status: item.status as BankCharge["status"] }];
  });
  const fingerprints = new Set<string>();
  for (let start = 0; start < rows.length; start += 100) {
    const batch = rows.slice(start, start + 100).map((item) => item.fingerprint);
    const [filed, skipped] = await Promise.all([
      admin.from("bank_transactions").select("fingerprint").eq("bank_account_id", bankAccountId).in("fingerprint", batch),
      admin.from("bank_skipped_fingerprints").select("fingerprint").eq("bank_account_id", bankAccountId).in("fingerprint", batch)
    ]);
    if (filed.error || skipped.error) return null;
    for (const item of [...(filed.data || []), ...(skipped.data || [])]) fingerprints.add(item.fingerprint);
  }
  return { rules: (rulesQuery.data || []) as BankRule[], properties, charges, fingerprints,
    legs: (legsQuery.data || []).map((item) => ({ bankAccountId: item.bank_account_id,
      postedOn: item.posted_on, amountCents: item.amount_cents, direction: item.direction, kind: item.kind })) as TransferLeg[] };
}
export async function propertyAllowed(admin: Admin, profileId: string, ownerAccountId: string, propertyId: string) {
  const { data, error } = await admin.from("properties").select("id, owner_account_id")
    .eq("id", propertyId).maybeSingle();
  if (error) { console.error("bank_load_property"); return false; }
  return data?.owner_account_id === ownerAccountId && await canUserAdministerProperty(profileId, propertyId);
}
