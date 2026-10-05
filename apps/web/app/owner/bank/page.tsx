import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankFeedShell } from "@/components/bank-feed/page-shell";
import { createBankAccount, importBankRows, answerBankItem, undoBankItem, deleteBankAccount } from "@/app/actions/bank-feed";

export const dynamic = "force-dynamic";

export default async function BankPage({ searchParams }: { searchParams?: { account?: string } }) {
  const { user } = await requireRole(["owner"]);
  const admin = createAdminClient();
  const members = await admin.from("ownership_account_members").select("account_id")
    .eq("profile_id", user.id).eq("member_role", "owner").eq("active", true);
  if (members.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const accountIds = (members.data || []).map((item) => item.account_id);
  if (!accountIds.length) return <main className="p-5">Set up a home account first.</main>;
  const accountsQuery = await admin.from("ownership_accounts").select("id, display_name").in("id", accountIds)
    .order("created_at", { ascending: true });
  if (accountsQuery.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const accounts = accountsQuery.data || [];
  const selected = accounts.find((item) => item.id === searchParams?.account) || accounts[0];
  if (!selected) return <main className="p-5">Set up a home account first.</main>;
  const [bankQuery, propertyQuery] = await Promise.all([
    admin.from("bank_accounts").select("id, nickname, institution").eq("owner_account_id", selected.id)
      .order("created_at", { ascending: true }),
    admin.from("properties").select("id, name").eq("owner_account_id", selected.id).eq("active", true)
  ]);
  if (bankQuery.error || propertyQuery.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const bankAccounts = bankQuery.data || [];
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
  if (recentQuery.error || unitsQuery.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const units = unitsQuery.data || [];
  const unitIds = units.map((item) => item.id);
  const leasesQuery = unitIds.length ? await admin.from("leases").select("id, unit_id")
    .in("unit_id", unitIds).eq("active", true) : { data: [], error: null };
  if (leasesQuery.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const leases = leasesQuery.data || [];
  const leaseIds = leases.map((item) => item.id);
  const chargesQuery = leaseIds.length ? await admin.from("rent_charges")
    .select("id, lease_id, due_date, amount_cents").in("lease_id", leaseIds).is("deleted_at", null)
    .order("due_date", { ascending: false }).limit(500) : { data: [], error: null };
  if (chargesQuery.error) return <main className="p-5">Bank activity is not ready yet.</main>;
  const unitMap = new Map(units.map((item) => [item.id, item.property_id]));
  const leaseProperty = new Map(leases.map((item) => [item.id, unitMap.get(item.unit_id)]));
  const propertyMap = new Map(properties.map((item) => [item.id, item.name]));
  const charges = (chargesQuery.data || []).map((item) => ({ id: item.id,
    propertyId: leaseProperty.get(item.lease_id) || "", dueDate: item.due_date, amountCents: item.amount_cents }));
  const recent = (recentQuery.data || []).map((item) => ({ ...item,
    propertyName: item.property_id ? propertyMap.get(item.property_id) || "Home" : "—" }));
  return <BankFeedShell ownerAccountId={selected.id} accounts={accounts} bankAccounts={bankAccounts}
    properties={properties} charges={charges} recent={recent}
    actions={{ createBankAccount, importBankRows, answerBankItem, undoBankItem, deleteBankAccount }} />;
}
