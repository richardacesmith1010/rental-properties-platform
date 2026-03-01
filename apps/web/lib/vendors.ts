import { createClient } from "@/lib/supabase/server";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";

export interface VendorDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  trade: string | null;
  active: boolean;
}

export async function getOwnerVendors(userId: string): Promise<VendorDTO[]> {
  const supabase = createClient();
  const ownerAccountIds = await getAdministeredOwnerAccountIds(userId);

  if (ownerAccountIds.length === 0) {
    return [];
  }

  const { data } = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, active")
    .in("owner_account_id", ownerAccountIds)
    .eq("active", true)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    trade: row.trade,
    active: row.active
  }));
}

export async function getManagerVendors(userId: string): Promise<VendorDTO[]> {
  return getOwnerVendors(userId);
}
