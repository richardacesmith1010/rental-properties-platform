import { getNextDueDateForLease } from "@/lib/action-items";
import { loadOwnerHomeMoney, type OwnerMoneyItem } from "@/lib/owner-recent-activity";
import { loadRentRowsForProperties } from "@/lib/owner-rent-rows";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getAdministeredProperties } from "@/lib/property-access";
import { getPortfolioData } from "@/lib/portfolio";
import { rentReceivedByPropertyId } from "@/lib/rent-received";
import { tracksLateRent } from "@/lib/lease-collection";
import { createAdminClient } from "@/lib/supabase/admin";

export interface WalletHomeEntry {
  id: string; name: string; city: string; state: string; accountId: string; accountName: string;
  activeLeases: { tenantNames: string[]; rentCents: number; nextDueDate: string | null }[];
  isLate: boolean; leftCents: number;
}

export type OwnerWalletHomeResult = {
  ok: true; homes: WalletHomeEntry[]; ytd: { inCents: number; outCents: number }; recent: OwnerMoneyItem[];
} | { ok: false; error: "load_failed" };

export async function loadOwnerWalletHome(userId: string, today = new Date()): Promise<OwnerWalletHomeResult> {
  try {
    const administered = await getAdministeredProperties(userId);
    const ids = [...new Set(administered.map((property) => property.id))];
    if (!ids.length) return { ok: true, homes: [], ytd: { inCents: 0, outCents: 0 }, recent: [] };
    const admin = createAdminClient();
    const yearFrom = `${today.getUTCFullYear()}-01-01`;
    const yearTo = `${today.getUTCFullYear() + 1}-01-01`;
    const [portfolio, accounts, rentRows, expenses, money] = await Promise.all([
      getPortfolioData(userId, null, ids),
      getOwnershipAccountsForUser(userId),
      loadRentRowsForProperties(ids, yearFrom, yearTo),
      admin.from("property_expenses").select("property_id, amount_cents, expense_date")
        .in("property_id", ids).gte("expense_date", yearFrom).lt("expense_date", yearTo),
      loadOwnerHomeMoney(ids, today)
    ]);
    if (expenses.error) throw expenses.error;
    if (!money.ok) throw new Error("Recent money unavailable.");
    const idSet = new Set(ids);
    const accountById = new Map(accounts.map((account) => [account.id, account.displayName]));
    const administeredById = new Map(administered.map((property) => [property.id, property.ownerAccountId]));
    const unitProperty = new Map(rentRows.units.map((unit) => [unit.id, unit.property_id]));
    const leaseProperty = new Map(rentRows.leases.map((lease) => [lease.id, unitProperty.get(lease.unit_id)]));
    const chargeProperty = new Map(rentRows.charges.map((charge) => [charge.id, leaseProperty.get(charge.lease_id)]));
    const inByProperty = rentReceivedByPropertyId(ids, rentRows.charges, rentRows.payments,
      chargeProperty, yearFrom, yearTo);
    const outByProperty = new Map<string, number>();
    for (const expense of expenses.data ?? []) {
      if (!idSet.has(expense.property_id)) continue;
      outByProperty.set(expense.property_id, (outByProperty.get(expense.property_id) ?? 0) + expense.amount_cents);
    }
    const collectionByLeaseId = new Map(portfolio.leases.map((lease) => [lease.id, lease]));
    const lateIds = new Set(rentRows.charges.filter((charge) => charge.status === "late" &&
      tracksLateRent(collectionByLeaseId.get(charge.lease_id)))
      .map((charge) => chargeProperty.get(charge.id)).filter((id): id is string => Boolean(id)));
    const homes = portfolio.properties.filter((property) => idSet.has(property.id)).map((property) => {
      const accountId = administeredById.get(property.id) ?? "";
      return {
        id: property.id, name: property.name, city: property.city, state: property.state,
        accountId, accountName: accountById.get(accountId) ?? property.ownerAccountName,
        activeLeases: portfolio.leases.filter((lease) => lease.active && lease.propertyId === property.id)
          .map((lease) => ({ tenantNames: [lease.tenantName].filter(Boolean), rentCents: lease.monthlyRentCents,
            nextDueDate: getNextDueDateForLease(lease, today)?.toISOString().slice(0, 10) ?? null })),
        isLate: lateIds.has(property.id), leftCents: money.leftByPropertyId[property.id] ?? 0
      };
    });
    return { ok: true, homes, ytd: {
      inCents: Object.values(inByProperty).reduce((sum, cents) => sum + cents, 0),
      outCents: [...outByProperty.values()].reduce((sum, cents) => sum + cents, 0)
    }, recent: money.items.filter((item) => idSet.has(item.propertyId)) };
  } catch (error) {
    console.error("Owner wallet home load failed", error);
    return { ok: false, error: "load_failed" };
  }
}
