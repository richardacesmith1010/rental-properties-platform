import "server-only";
import { createClient } from "@/lib/supabase/server";
import { depositHeldCents } from "@/lib/deposits";

export interface CashOnHand {
  accountId: string; accountName: string; bankCents: number; depositsHeldCents: number;
  yoursCents: number; checkedAt: string | null; stale: boolean; hasBalance: boolean;
  complete: boolean; missingNames: string[];
}

const plaidSubtypes = new Set(["checking", "savings", "cash management", "money market"]);

export function eligibleBankAccount(bank: { source: string; connection_id: string | null;
  account_type: string | null; account_subtype: string | null; iso_currency_code: string | null },
connectionStatus: string | undefined): boolean {
  if (bank.source === "upload") return true;
  return bank.source === "plaid" && Boolean(bank.connection_id)
    && ["ok", "error", "needs_login"].includes(connectionStatus ?? "")
    && (bank.account_type === null || bank.account_type === "depository")
    && (bank.account_subtype === null || plaidSubtypes.has(bank.account_subtype))
    && (bank.iso_currency_code === null || bank.iso_currency_code === "USD");
}

export async function loadCashOnHand(userId: string, now = new Date()): Promise<CashOnHand[]> {
  const db = createClient();
  const membership = await db.from("ownership_account_members").select("account_id")
    .eq("profile_id", userId).eq("member_role", "owner").eq("active", true);
  if (membership.error) throw membership.error;
  const accountIds = [...new Set((membership.data ?? []).map((row) => row.account_id))];
  if (!accountIds.length) return [];
  const [accounts, banks, connections, properties] = await Promise.all([
    db.from("ownership_accounts").select("id,display_name").in("id", accountIds),
    db.from("bank_accounts")
      .select(`id,owner_account_id,nickname,institution,source,connection_id,account_type,account_subtype,
        iso_currency_code,balance_cents,balance_as_of`)
      .in("owner_account_id", accountIds),
    db.from("bank_connections").select("id,status").in("owner_account_id", accountIds),
    db.from("properties").select("id,owner_account_id").in("owner_account_id", accountIds)
  ]);
  for (const result of [accounts, banks, connections, properties]) if (result.error) throw result.error;
  const propertyIds = (properties.data ?? []).map((row) => row.id);
  const units = propertyIds.length ? await db.from("units").select("id,property_id").in("property_id", propertyIds)
    : { data: [], error: null };
  if (units.error) throw units.error;
  const unitIds = (units.data ?? []).map((row) => row.id);
  const leases = unitIds.length ? await db.from("leases").select("id,unit_id,deposit_cents").in("unit_id", unitIds)
    : { data: [], error: null };
  if (leases.error) throw leases.error;
  const leaseIds = (leases.data ?? []).map((row) => row.id);
  const returns = leaseIds.length ? await db.from("lease_deposit_returns")
    .select("lease_id,returned_cents,returned_on").in("lease_id", leaseIds)
    : { data: [], error: null };
  if (returns.error) throw returns.error;
  const connectionStatus = new Map((connections.data ?? []).map((row) => [row.id, row.status]));
  const propertyAccount = new Map((properties.data ?? []).map((row) => [row.id, row.owner_account_id]));
  const unitAccount = new Map((units.data ?? []).map((row) => [row.id, propertyAccount.get(row.property_id)]));
  const returnMap = new Map((returns.data ?? []).map((row) => [row.lease_id, row]));
  const held = new Map<string, number>();
  for (const lease of leases.data ?? []) {
    const accountId = unitAccount.get(lease.unit_id);
    if (accountId) held.set(accountId,
      (held.get(accountId) ?? 0) + depositHeldCents(lease, returnMap.get(lease.id) ?? null));
  }
  return (accounts.data ?? []).map((account) => {
    const eligible = (banks.data ?? []).filter((bank) => bank.owner_account_id === account.id
      && eligibleBankAccount(bank, bank.connection_id ? connectionStatus.get(bank.connection_id) : undefined));
    const missingNames = eligible.filter((bank) => bank.balance_cents === null || bank.balance_as_of === null)
      .map((bank) => bank.nickname || bank.institution);
    const balanced = eligible.filter((bank) => bank.balance_cents !== null && bank.balance_as_of !== null);
    const bankCents = balanced.reduce((sum, bank) => sum + Number(bank.balance_cents), 0);
    const checkedAt = balanced.map((bank) => bank.balance_as_of!).sort()[0] ?? null;
    const depositsHeldCents = held.get(account.id) ?? 0;
    return { accountId: account.id, accountName: account.display_name, bankCents, depositsHeldCents,
      yoursCents: bankCents - depositsHeldCents, checkedAt,
      stale: checkedAt !== null && now.getTime() - Date.parse(checkedAt) > 3 * 86_400_000,
      hasBalance: balanced.length > 0, complete: missingNames.length === 0, missingNames };
  });
}
