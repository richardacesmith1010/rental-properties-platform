import { createClient } from "@/lib/supabase/server";

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

  const { data } = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, active")
    .eq("owner_profile_id", userId)
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
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  const propertyIds = (assignments ?? []).map((assignment) => assignment.property_id);
  if (propertyIds.length === 0) {
    return [];
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("owner_profile_id")
    .in("id", propertyIds);

  const ownerIds = Array.from(new Set((properties ?? []).map((property) => property.owner_profile_id)));
  if (ownerIds.length === 0) {
    return [];
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, active")
    .in("owner_profile_id", ownerIds)
    .eq("active", true)
    .order("name", { ascending: true });

  return (vendors ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    trade: row.trade,
    active: row.active
  }));
}
