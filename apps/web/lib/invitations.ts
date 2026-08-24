import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/format";
import { getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface InvitationListItem {
  id: string;
  email: string;
  fullName: string;
  role: "tenant" | "manager" | "owner";
  propertyId: string | null;
  propertyName: string | null;
  ownershipAccountName: string | null;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  acceptedAt: string | null;
}

export interface TenantInviteOnboardingContext {
  invitationId: string | null;
  tenantName: string | null;
  ownerName: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
  unitLabel: string | null;
  monthlyRentLabel: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  status: "pending" | "accepted" | "expired" | null;
}

function readInviteMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readInviteMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractTenantInviteNames(
  metadata: Record<string, unknown> | undefined
) {
  return {
    ownerName: readInviteMetadataString(metadata, "owner_name"),
    propertyName: readInviteMetadataString(metadata, "property_name"),
    propertyAddress: readInviteMetadataString(metadata, "property_address")
  };
}

function buildPropertyAddress(row: {
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}) {
  const locality = [row.city, row.state, row.postal_code].filter(Boolean).join(" ");
  return [row.address_line1, locality].filter(Boolean).join(", ");
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
    propertyId: inv.property_id ?? null,
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

export async function getTenantInviteOnboardingContext(params: {
  userId: string;
  email: string | null | undefined;
  userMetadata?: Record<string, unknown>;
}): Promise<TenantInviteOnboardingContext | null> {
  const email = params.email?.toLowerCase().trim();
  const supabase = createClient();
  const byProfileId = await supabase
    .from("invitations")
    .select("id, full_name, property_id, invited_by, status, created_at")
    .eq("role", "tenant")
    .eq("invited_profile_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const byEmail =
    !byProfileId.data?.[0] && email
      ? await supabase
          .from("invitations")
          .select("id, full_name, property_id, invited_by, status, created_at")
          .eq("role", "tenant")
          .eq("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
      : null;

  const invitation = byProfileId.data?.[0] ?? byEmail?.data?.[0] ?? null;
  const propertyId =
    invitation?.property_id ?? readInviteMetadataString(params.userMetadata, "property_id");
  const unitId = readInviteMetadataString(params.userMetadata, "unit_id");
  const inviteNames = extractTenantInviteNames(params.userMetadata);
  const unitLabelFromMetadata = readInviteMetadataString(params.userMetadata, "unit_label");
  const monthlyRentCents = readInviteMetadataNumber(params.userMetadata, "monthly_rent_cents");
  const leaseStartDate = readInviteMetadataString(params.userMetadata, "lease_start_date");
  const leaseEndDate = readInviteMetadataString(params.userMetadata, "lease_end_date");

  if (!invitation && !propertyId) {
    return null;
  }

  const [{ data: property }, { data: unit }, { data: inviterProfile }] = await Promise.all([
    propertyId
      ? supabase
          .from("properties")
          .select("name, address_line1, city, state, postal_code")
          .eq("id", propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase
          .from("units")
          .select("unit_number")
          .eq("id", unitId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invitation?.invited_by
      ? supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", invitation.invited_by)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  return {
    invitationId: invitation?.id ?? null,
    tenantName:
      readInviteMetadataString(params.userMetadata, "full_name") ??
      invitation?.full_name ??
      null,
    ownerName:
      inviteNames.ownerName ?? inviterProfile?.full_name ?? inviterProfile?.email ?? null,
    propertyName: inviteNames.propertyName ?? property?.name ?? null,
    propertyAddress:
      inviteNames.propertyAddress ?? (property ? buildPropertyAddress(property) : null),
    unitLabel: unitLabelFromMetadata ?? unit?.unit_number ?? null,
    monthlyRentLabel:
      monthlyRentCents != null && monthlyRentCents > 0 ? formatCurrency(monthlyRentCents) : null,
    leaseStartDate,
    leaseEndDate,
    status:
      invitation?.status === "pending" ||
      invitation?.status === "accepted" ||
      invitation?.status === "expired"
        ? invitation.status
        : null
  };
}

export async function markTenantInvitationAccepted(profileId: string) {
  const admin = createAdminClient();
  const acceptedAt = new Date().toISOString();
  const { error } = await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: acceptedAt })
    .eq("role", "tenant")
    .eq("invited_profile_id", profileId)
    .eq("status", "pending");

  if (error && !isMissingSchemaError(error)) {
    console.error("markTenantInvitationAccepted error:", error);
  }
}
