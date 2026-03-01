import { createClient } from "@/lib/supabase/server";
import { getAdministeredOwnerAccountIds } from "@/lib/property-access";

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

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("column") && message.includes("does not exist")
  );
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
