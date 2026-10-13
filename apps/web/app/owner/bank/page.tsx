import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { OwnerBottomBar } from "@/components/dashboard/owner-bottom-bar";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectableRentCharges } from "@/lib/bank-feed/match";
import { BankFeedShell } from "@/components/bank-feed/page-shell";
import { createBankAccount, importBankRows, answerBankItem, undoBankItem, deleteBankAccount,
  answerQueuedBankItem, keepBankChange } from "@/app/actions/bank-feed";
import { startBankLink, finishBankLink, startBankRelink, finishBankRelink, refreshBank }
  from "@/app/actions/bank-connections";
import { confirmBankLinks, skipBankLinks, disconnectBank } from "@/app/actions/bank-connection-management";
import { BankBalancesCard } from "@/components/bank-feed/bank-balances-card";
import { setManualBalance } from "@/app/actions/bank-balances";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const dynamic = "force-dynamic";

function BankStatus({ message }: { message: string }) {
  return <>
    <main className="min-h-screen p-5 pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] lg:pb-5">
      {message}
    </main>
    <OwnerBottomBar />
  </>;
}

export default async function BankPage(props: { searchParams?: Promise<{ account?: string }> }) {
  const searchParams = await props.searchParams;
  const { user } = await requireRole(["owner"]);
  const admin = createAdminClient();
  const members = await admin.from("ownership_account_members").select("account_id")
    .eq("profile_id", user.id).eq("member_role", "owner").eq("active", true);
  if (members.error) return <BankStatus message="Bank activity is not ready yet." />;
  const accountIds = (members.data || []).map((item) => item.account_id);
  if (!accountIds.length) return <BankStatus message="Set up a home account first." />;
  const accountsQuery = await admin.from("ownership_accounts").select("id, display_name").in("id", accountIds)
    .order("created_at", { ascending: true });
  if (accountsQuery.error) return <BankStatus message="Bank activity is not ready yet." />;
  const accounts = accountsQuery.data || [];
  const selected = accounts.find((item) => item.id === searchParams?.account) || accounts[0];
  if (!selected) return <BankStatus message="Set up a home account first." />;
  const [bankQueryRaw, propertyQuery] = await Promise.all([
    admin.from("bank_accounts").select("id, nickname, institution, source, connection_id, balance_cents, balance_as_of")
      .eq("owner_account_id", selected.id)
      .order("created_at", { ascending: true }),
    admin.from("properties").select("id, name").eq("owner_account_id", selected.id).eq("active", true)
  ]);
  const bankQuery = bankQueryRaw.error && isMissingSchemaError(bankQueryRaw.error)
    ? await admin.from("bank_accounts").select("id,nickname,institution")
      .eq("owner_account_id", selected.id).order("created_at", { ascending: true })
    : bankQueryRaw;
  if (bankQuery.error || propertyQuery.error) return <BankStatus message="Bank activity is not ready yet." />;
  const bankAccounts = (bankQuery.data || []).map((bank) => ({ ...bank,
    source: "source" in bank ? String(bank.source) : "upload",
    connection_id: "connection_id" in bank ? bank.connection_id : null,
    balance_cents: "balance_cents" in bank && typeof bank.balance_cents === "number" ? bank.balance_cents : null,
    balance_as_of: "balance_as_of" in bank && typeof bank.balance_as_of === "string" ? bank.balance_as_of : null }));
  const [connectionsQuery, queueQuery, changedQuery] = await Promise.all([
    admin.from("bank_connections").select("id,institution_name,status,last_synced_at")
      .eq("owner_account_id", selected.id).order("created_at", { ascending: false }),
    admin.from("bank_review_items").select("id,bank_account_id,updated_at,posted_on,amount_cents,direction,description,suggestion,possible_duplicate")
      .eq("owner_account_id", selected.id)
      .order("created_at", { ascending: false }),
    bankAccounts.length ? admin.from("bank_transactions").select("id,description,bank_change")
      .in("bank_account_id", bankAccounts.map((bank) => bank.id)).not("bank_change", "is", null)
      : Promise.resolve({ data: [], error: null })
  ]);
  if ([connectionsQuery.error, queueQuery.error, changedQuery.error]
    .some((error) => error && !isMissingSchemaError(error))) {
    return <BankStatus message="Bank activity is not ready yet." />;
  }
  const connections = (connectionsQuery.data || []).map((connection) => ({ ...connection,
    accounts: bankAccounts.filter((bank) => bank.connection_id === connection.id) }));
  const pending = connections.find((connection) => connection.status === "pending_account_match");
  const pendingMatch = pending ? { connectionId: pending.id,
    plaidAccounts: pending.accounts, uploadAccounts: bankAccounts.filter((bank) => bank.source === "upload") } : undefined;
  const properties = propertyQuery.data || [];
  const bankIds = bankAccounts.map((item) => item.id);
  const propertyIds = properties.map((item) => item.id);
  const [recentQuery, unitsQuery] = await Promise.all([
    bankIds.length ? admin.from("bank_transactions")
      .select("id, posted_on, description, amount_cents, direction, kind, property_id, created_record")
      .in("bank_account_id", bankIds).order("posted_on", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length ? admin.from("units").select("id, property_id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (recentQuery.error || unitsQuery.error) return <BankStatus message="Bank activity is not ready yet." />;
  const units = unitsQuery.data || [];
  const unitIds = units.map((item) => item.id);
  const leasesQuery = unitIds.length ? await admin.from("leases").select("id, unit_id")
    .in("unit_id", unitIds).eq("active", true) : { data: [], error: null };
  if (leasesQuery.error) return <BankStatus message="Bank activity is not ready yet." />;
  const leases = leasesQuery.data || [];
  const leaseIds = leases.map((item) => item.id);
  const chargesQuery = leaseIds.length ? await admin.from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status, deleted_at").in("lease_id", leaseIds).is("deleted_at", null)
    .order("due_date", { ascending: false }).limit(500) : { data: [], error: null };
  if (chargesQuery.error) return <BankStatus message="Bank activity is not ready yet." />;
  const unitMap = new Map(units.map((item) => [item.id, item.property_id]));
  const leaseProperty = new Map(leases.map((item) => [item.id, unitMap.get(item.unit_id)]));
  const propertyMap = new Map(properties.map((item) => [item.id, item.name]));
  const charges = selectableRentCharges(chargesQuery.data || []).map((item) => ({ id: item.id,
    propertyId: leaseProperty.get(item.lease_id) || "", dueDate: item.due_date, amountCents: item.amount_cents }));
  const recent = (recentQuery.data || []).map((item) => ({ ...item,
    propertyName: item.property_id ? propertyMap.get(item.property_id) || "Home" : "—" }));
  return <>
    <div className="pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] lg:pb-0">
      <Link href="/owner" title="Return home."
        className="hidden min-h-11 items-center px-4 text-sm text-[var(--muted)] lg:inline-flex">
        ← Home
      </Link>
    <BankBalancesCard accounts={bankAccounts} save={setManualBalance} />
    <BankFeedShell ownerAccountId={selected.id} accounts={accounts} bankAccounts={bankAccounts}
    properties={properties} charges={charges} recent={recent}
    connections={connections} pendingMatch={pendingMatch} queued={queueQuery.data || []}
    changed={changedQuery.data || []}
    connectionActions={{ start: startBankLink, finish: finishBankLink, startRelink: startBankRelink,
      finishRelink: finishBankRelink, refresh: refreshBank, disconnect: disconnectBank,
      confirm: confirmBankLinks, skip: skipBankLinks }}
    queueActions={{ answer: answerQueuedBankItem, keep: keepBankChange, undo: undoBankItem }}
    actions={{ createBankAccount, importBankRows, answerBankItem, undoBankItem, deleteBankAccount }} />
    </div>
    <OwnerBottomBar />
  </>;
}
