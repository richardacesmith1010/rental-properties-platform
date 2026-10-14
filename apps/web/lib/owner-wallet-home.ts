import { countMyDueTasks } from "@/lib/account-tasks";
import { depositHeldCents } from "@/lib/deposits";
import { getNextDueDateForLease } from "@/lib/action-items";
import { buildHomeMoney, type OwnerMoneyItem } from "@/lib/owner-recent-activity";
import { loadRentRowsForProperties } from "@/lib/owner-rent-rows";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getAdministeredProperties } from "@/lib/property-access";
import { getPortfolioData } from "@/lib/portfolio";
import { rentOnlyReceivedByPropertyId } from "@/lib/rent-received";
import type { ChargeLine } from "@/lib/charge-lines";
import { tracksLateRent } from "@/lib/lease-collection";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface WalletHomeEntry {
  id: string; name: string; city: string; state: string; accountId: string; accountName: string;
  accountType: "individual" | "llc"; addressLine1: string; leaseEndDate: string | null;
  rentDueThisYear: number; rentOnTimeThisYear: number;
  activeLeases: { tenantNames: string[]; rentCents: number; nextDueDate: string | null }[];
  isLate: boolean; leftCents: number; depositCents: number; depositReturned: boolean;
}

export type OwnerWalletHomeResult = {
  ok: true; homes: WalletHomeEntry[]; ytd: { inCents: number; outCents: number }; recent: OwnerMoneyItem[];
  yearRentReceivedByPropertyId: Record<string, number>;
  myTasksDueCount?: number; bankNeedsCount?: number; hasBankConnection?: boolean; hasPendingBankConnection?: boolean;
} | { ok: false; error: "load_failed" };

async function loadBankNeedState(admin: ReturnType<typeof createAdminClient>, ownerIds: string[]) {
  let bankNeedsCount = 0;
  let hasBankConnection = false;
  let hasPendingBankConnection = false;
  if (ownerIds.length) {
    const [queue, changed, connections] = await Promise.all([
      admin.from("bank_review_items").select("id", { count: "exact", head: true })
        .in("owner_account_id", ownerIds),
      admin.from("bank_transactions").select("id, bank_accounts!inner(owner_account_id)",
        { count: "exact", head: true }).in("bank_accounts.owner_account_id", ownerIds)
        .not("bank_change", "is", null),
      admin.from("bank_connections").select("id,status").in("owner_account_id", ownerIds)
    ]);
    if (queue.error && !isMissingSchemaError(queue.error)) throw queue.error;
    if (changed.error && !isMissingSchemaError(changed.error)) throw changed.error;
    if (connections.error && !isMissingSchemaError(connections.error)) throw connections.error;
    bankNeedsCount = (queue.count || 0) + (changed.count || 0);
    hasBankConnection = (connections.data || []).some((connection) => connection.status !== "revoked");
    hasPendingBankConnection = (connections.data || []).some(
      (connection) => connection.status === "pending_account_match");
  }
  return { bankNeedsCount, hasBankConnection, hasPendingBankConnection };
}

export async function loadOwnerWalletHome(userId: string, today = new Date()): Promise<OwnerWalletHomeResult> {
  try {
    const administered = await getAdministeredProperties(userId);
    const ids = [...new Set(administered.map((property) => property.id))];
    if (!ids.length) {
      const accounts = await getOwnershipAccountsForUser(userId);
      const [bankNeeds, myTasksDueCount] = await Promise.all([
        loadBankNeedState(createAdminClient(), accounts.map((account) => account.id)),
        countMyDueTasks(userId, today)
      ]);
      return { ok: true, homes: [], ytd: { inCents: 0, outCents: 0 }, recent: [],
        yearRentReceivedByPropertyId: {}, ...bankNeeds, myTasksDueCount };
    }
    const admin = createAdminClient();
    const yearFrom = `${today.getUTCFullYear()}-01-01`;
    const yearTo = `${today.getUTCFullYear() + 1}-01-01`;
    const previousFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
      .toISOString().slice(0, 10);
    const from = previousFrom < yearFrom ? previousFrom : yearFrom;
    const portfolioPromise = getPortfolioData(userId, null, ids);
    const accountsPromise = getOwnershipAccountsForUser(userId);
    const [portfolio, accounts, rentRows, expenses, bankNeeds, lines, myTasksDueCount] = await Promise.all([
      portfolioPromise,
      accountsPromise,
      loadRentRowsForProperties(ids, from, yearTo),
      admin.from("property_expenses").select("id, property_id, category, description, amount_cents, expense_date")
        .in("property_id", ids).gte("expense_date", from).lt("expense_date", yearTo),
      accountsPromise.then((loaded) => loadBankNeedState(admin, loaded.map((account) => account.id))),
      portfolioPromise.then(async (loaded) => {
        const leaseIds = [...new Set(loaded.leases.map((lease) => lease.id))];
        if (!leaseIds.length) return [] as ChargeLine[];
        const { data, error } = await admin.from("rent_charge_lines")
          .select("id, lease_id, charge_id, kind, label, amount_cents, created_at").in("lease_id", leaseIds);
        if (error) {
          if (isMissingSchemaError(error)) return [] as ChargeLine[];
          throw error;
        }
        return (data ?? []) as ChargeLine[];
      }),
      countMyDueTasks(userId, today)
    ]);
    if (expenses.error) throw expenses.error;
    const idSet = new Set(ids);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const administeredById = new Map(administered.map((property) => [property.id, property.ownerAccountId]));
    const unitProperty = new Map(rentRows.units.map((unit) => [unit.id, unit.property_id]));
    const leaseProperty = new Map(rentRows.leases.map((lease) => [lease.id, unitProperty.get(lease.unit_id)]));
    const chargeProperty = new Map(rentRows.charges.map((charge) => [charge.id, leaseProperty.get(charge.lease_id)]));
    const inByProperty = rentOnlyReceivedByPropertyId(ids, rentRows.charges, rentRows.payments,
      chargeProperty, yearFrom, yearTo, lines);
    const yearRentReceivedByPropertyId = inByProperty;
    const outByProperty = new Map<string, number>();
    for (const expense of expenses.data ?? []) {
      if (!idSet.has(expense.property_id) || expense.expense_date < yearFrom) continue;
      outByProperty.set(expense.property_id, (outByProperty.get(expense.property_id) ?? 0) + expense.amount_cents);
    }
    const collectionByLeaseId = new Map(portfolio.leases.map((lease) => [lease.id, lease]));
    const tenantNameByLeaseId = new Map(rentRows.leases.filter((lease) => lease.tenant_profile_id)
      .map((lease) => [lease.id, collectionByLeaseId.get(lease.id)?.tenantName || "Tenant"]));
    const money = buildHomeMoney({ rentRows, expenses: expenses.data ?? [],
      propertyNames: Object.fromEntries(portfolio.properties.map((property) => [property.id, property.name])),
      tenantNameByLeaseId, ids, today });
    if (!money.ok) throw new Error("Recent money unavailable.");
    const lateIds = new Set(rentRows.charges.filter((charge) => charge.status === "late" &&
      tracksLateRent(collectionByLeaseId.get(charge.lease_id)))
      .map((charge) => chargeProperty.get(charge.id)).filter((id): id is string => Boolean(id)));
    const leaseById = new Map(rentRows.leases.map((lease) => [lease.id, lease]));
    const paymentsByCharge = new Map<string, typeof rentRows.payments>();
    for (const payment of rentRows.payments) {
      const group = paymentsByCharge.get(payment.rent_charge_id) ?? [];
      group.push(payment);
      paymentsByCharge.set(payment.rent_charge_id, group);
    }
    const dueByProperty = new Map<string, { due: number; onTime: number }>();
    const todayDate = today.toISOString().slice(0, 10);
    for (const charge of rentRows.charges) {
      if (charge.category !== "rent" || charge.due_date < yearFrom || charge.due_date > todayDate) continue;
      const propertyId = chargeProperty.get(charge.id);
      if (!propertyId) continue;
      const count = dueByProperty.get(propertyId) ?? { due: 0, onTime: 0 };
      count.due += 1;
      const due = new Date(`${charge.due_date}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + (leaseById.get(charge.lease_id)?.grace_period_days ?? 0));
      const deadline = due.toISOString().slice(0, 10);
      const paidOnTime = (paymentsByCharge.get(charge.id) ?? [])
        .filter((payment) => payment.paid_at.slice(0, 10) >= yearFrom &&
          payment.paid_at.slice(0, 10) <= deadline && payment.paid_at.slice(0, 10) <= todayDate)
        .reduce((sum, payment) => sum + payment.amount_cents, 0);
      if (paidOnTime >= charge.amount_cents) count.onTime += 1;
      dueByProperty.set(propertyId, count);
    }
    const homes = portfolio.properties.filter((property) => idSet.has(property.id)).map((property) => {
      const accountId = administeredById.get(property.id) ?? "";
      const active = portfolio.leases.filter((lease) => lease.active && lease.propertyId === property.id);
      const endDates = active.map((lease) => lease.endDate).filter(Boolean).sort();
      return {
        id: property.id, name: property.name, city: property.city, state: property.state,
        accountId, accountName: accountById.get(accountId)?.displayName ?? property.ownerAccountName,
        accountType: accountById.get(accountId)?.accountType ?? "individual" as const,
        addressLine1: property.addressLine1, leaseEndDate: endDates[0] ?? null,
        rentDueThisYear: dueByProperty.get(property.id)?.due ?? 0,
        rentOnTimeThisYear: dueByProperty.get(property.id)?.onTime ?? 0,
        activeLeases: active
          .map((lease) => ({ tenantNames: [lease.tenantName].filter(Boolean), rentCents: lease.monthlyRentCents,
            nextDueDate: getNextDueDateForLease(lease, today)?.toISOString().slice(0, 10) ?? null })),
        depositCents: active.reduce((sum, lease) => sum + depositHeldCents(
          { deposit_cents: lease.depositCents }, lease.depositReturn ?? null), 0),
        depositReturned: active.length > 0 && active.every((lease) => Boolean(lease.depositReturn)),
        isLate: lateIds.has(property.id), leftCents: money.leftByPropertyId[property.id] ?? 0
      };
    });
    return { ok: true, homes, yearRentReceivedByPropertyId, ytd: {
      inCents: Object.values(inByProperty).reduce((sum, cents) => sum + cents, 0),
      outCents: [...outByProperty.values()].reduce((sum, cents) => sum + cents, 0)
    }, recent: money.items.filter((item) => idSet.has(item.propertyId)), ...bankNeeds, myTasksDueCount };
  } catch (error) {
    console.error("Owner wallet home load failed", error);
    return { ok: false, error: "load_failed" };
  }
}
