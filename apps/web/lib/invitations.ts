import { createClient } from "@/lib/supabase/server";
import { getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface InvitationListItem {
  id: string;
  email: string;
  fullName: string;
  role: "tenant" | "manager" | "owner";
  propertyName: string | null;
  ownershipAccountName: string | null;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  acceptedAt: string | null;
}

export async function getOwnerInvitations(
  userId: string,
  accountId?: string | null
): Promise<InvitationListItem[]> {
  const supabase = createClient();
  const scopedPropertyIds =
    accountId ? await getAdministeredPropertyIdsForAccount(userId, accountId) : null;
  const canAccessScopedAccount =
    accountId ? await canUserAdministerOwnershipAccount(userId, accountId) : true;

  if (accountId && !canAccessScopedAccount) {
    return [];
  }

  const query = await supabase
    .from("invitations")
    .select(
      "id, email, full_name, role, property_id, ownership_account_id, status, created_at, accepted_at"
    )
    .eq("invited_by", userId)
    .order("created_at", { ascending: false });

  let invitations = query.data;
  if (query.error && isMissingSchemaError(query.error)) {
    const legacyQuery = await supabase
      .from("invitations")
      .select("id, email, full_name, role, property_id, status, created_at, accepted_at")
      .eq("invited_by", userId)
      .order("created_at", { ascending: false });

    invitations = (legacyQuery.data ?? []).map((row) => ({
      ...row,
      ownership_account_id: null
    }));
  }

  if (!invitations || invitations.length === 0) {
    return [];
  }

  if (accountId) {
    const scopedPropertyIdSet = new Set(scopedPropertyIds ?? []);
    invitations = invitations.filter(
      (invitation) =>
        invitation.ownership_account_id === accountId ||
        (typeof invitation.property_id === "string" &&
          scopedPropertyIdSet.has(invitation.property_id))
    );
  }

  if (!invitations || invitations.length === 0) {
    return [];
  }

  // Fetch property names for manager invitations
  const propertyIds = invitations
    .map((inv) => inv.property_id)
    .filter((id): id is string => id !== null);

  const accountIds = invitations
    .map((inv) => inv.ownership_account_id)
    .filter((id): id is string => id !== null);

  const [{ data: properties }, { data: ownershipAccounts }] = await Promise.all([
    propertyIds.length > 0
      ? supabase
          .from("properties")
          .select("id, name")
          .in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    accountIds.length > 0
      ? supabase
          .from("ownership_accounts")
          .select("id, display_name")
          .in("id", accountIds)
      : Promise.resolve({ data: [] })
  ]);

  const propertyMap = new Map(
    (properties ?? []).map((p) => [p.id, p.name])
  );
  const ownershipAccountMap = new Map(
    (ownershipAccounts ?? []).map((account) => [account.id, account.display_name])
  );

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    fullName: inv.full_name,
    role: inv.role as "tenant" | "manager" | "owner",
    propertyName: inv.property_id
      ? propertyMap.get(inv.property_id) ?? null
      : null,
    ownershipAccountName: inv.ownership_account_id
      ? ownershipAccountMap.get(inv.ownership_account_id) ?? null
      : null,
    status: inv.status as "pending" | "accepted" | "expired",
    createdAt: inv.created_at,
    acceptedAt: inv.accepted_at,
  }));
}
