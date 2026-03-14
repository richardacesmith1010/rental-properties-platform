import { createClient } from "@/lib/supabase/server";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface VendorDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  trade: string | null;
  tradeCategory: string | null;
  preferred: boolean;
  active: boolean;
}

export async function getOwnerVendors(userId: string): Promise<VendorDTO[]> {
  const supabase = createClient();
  const ownerAccountIds = await getAdministeredOwnerAccountIds(userId);
  if (ownerAccountIds.length === 0) {
    // Legacy fallback for pre-Phase-9 installations.
    const { data: legacyData } = await supabase
      .from("vendors")
      .select("id, name, email, phone, trade, active")
      .eq("owner_profile_id", userId)
      .eq("active", true)
      .order("name", { ascending: true });

    return (legacyData ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      trade: row.trade,
      tradeCategory: row.trade ?? null,
      preferred: false,
      active: row.active
    }));
  }

  const modernQuery = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, trade_category, preferred, active")
    .in("owner_account_id", ownerAccountIds)
    .eq("active", true)
    .order("name", { ascending: true });

  if (!modernQuery.error) {
    return (modernQuery.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      trade: row.trade,
      tradeCategory: row.trade_category,
      preferred: row.preferred ?? false,
      active: row.active
    }));
  }

  if (modernQuery.error && isMissingSchemaError(modernQuery.error)) {
    const { data: legacyData } = await supabase
      .from("vendors")
      .select("id, name, email, phone, trade, active")
      .eq("owner_profile_id", userId)
      .eq("active", true)
      .order("name", { ascending: true });

    return (legacyData ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      trade: row.trade,
      tradeCategory: row.trade ?? null,
      preferred: false,
      active: row.active
    }));
  }

  return [];
}

export async function getManagerVendors(userId: string): Promise<VendorDTO[]> {
  return getOwnerVendors(userId);
}
