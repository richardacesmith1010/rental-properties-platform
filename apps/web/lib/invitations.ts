import { createClient } from "@/lib/supabase/server";

export interface InvitationListItem {
  id: string;
  email: string;
  fullName: string;
  role: "tenant" | "manager";
  propertyName: string | null;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  acceptedAt: string | null;
}

export async function getOwnerInvitations(
  userId: string
): Promise<InvitationListItem[]> {
  const supabase = createClient();

  const { data: invitations } = await supabase
    .from("invitations")
    .select(
      "id, email, full_name, role, property_id, status, created_at, accepted_at"
    )
    .eq("invited_by", userId)
    .order("created_at", { ascending: false });

  if (!invitations || invitations.length === 0) {
    return [];
  }

  // Fetch property names for manager invitations
  const propertyIds = invitations
    .map((inv) => inv.property_id)
    .filter((id): id is string => id !== null);

  let propertyMap = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);

    propertyMap = new Map(
      (properties ?? []).map((p) => [p.id, p.name])
    );
  }

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    fullName: inv.full_name,
    role: inv.role as "tenant" | "manager",
    propertyName: inv.property_id
      ? propertyMap.get(inv.property_id) ?? null
      : null,
    status: inv.status as "pending" | "accepted" | "expired",
    createdAt: inv.created_at,
    acceptedAt: inv.accepted_at,
  }));
}
