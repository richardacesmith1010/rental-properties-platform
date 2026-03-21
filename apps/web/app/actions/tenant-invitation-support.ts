import { createAdminClient } from "@/lib/supabase/admin";
import type { SendTenantInviteEmailParams } from "@/lib/invite-email";

type TenantInviteEmailDraft = Omit<SendTenantInviteEmailParams, "inviteUrl">;

export interface TenantInviteMetadata {
  role: "tenant";
  full_name: string;
  property_id: string;
  property_name: string;
  property_address: string;
  owner_name: string;
  invited_by: string;
  unit_id?: string;
  unit_label?: string;
  tenant_phone?: string;
  monthly_rent_cents?: number;
  lease_start_date?: string;
  lease_end_date?: string;
}

export interface TenantInvitationRecord {
  email: string;
  full_name: string;
  property_id: string | null;
  invited_profile_id?: string | null;
}

export interface TenantInviteContextSuccess {
  property: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  inviterName: string;
  unit: {
    id: string;
    property_id: string;
    unit_number: string;
  } | null;
}

export interface TenantInviteContextFailure {
  error: string;
}

export function normalizeOptionalString(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function buildPropertyAddress(property: {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
}) {
  const locality = [property.city, property.state, property.postal_code]
    .filter(Boolean)
    .join(" ");
  return [property.address_line1, locality].filter(Boolean).join(", ");
}

function readInviteMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readInviteMetadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function getTenantInviteContext(params: {
  userId: string;
  propertyId: string;
  unitId?: string;
}): Promise<TenantInviteContextSuccess | TenantInviteContextFailure> {
  const admin = createAdminClient();
  const [{ data: property }, { data: inviterProfile }, { data: unit }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code")
      .eq("id", params.propertyId)
      .maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", params.userId).maybeSingle(),
    params.unitId
      ? admin
          .from("units")
          .select("id, property_id, unit_number")
          .eq("id", params.unitId)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (!property) {
    return { error: "Property not found." } as const;
  }

  if (unit && unit.property_id !== params.propertyId) {
    return { error: "Selected unit does not belong to this property." } as const;
  }

  return {
    property,
    inviterName: inviterProfile?.full_name ?? inviterProfile?.email ?? "Your landlord",
    unit
  } as const;
}

export function buildTenantInviteMetadata(params: {
  fullName: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  invitedBy: string;
  unitId?: string;
  unitLabel?: string;
  phone?: string;
  monthlyRentDollars?: number;
  leaseStartDate?: string;
  leaseEndDate?: string;
}): TenantInviteMetadata {
  return {
    role: "tenant",
    full_name: params.fullName,
    property_id: params.propertyId,
    property_name: params.propertyName,
    property_address: params.propertyAddress,
    owner_name: params.ownerName,
    invited_by: params.invitedBy,
    unit_id: params.unitId,
    unit_label: params.unitLabel,
    tenant_phone: params.phone,
    monthly_rent_cents:
      params.monthlyRentDollars != null ? Math.round(params.monthlyRentDollars * 100) : undefined,
    lease_start_date: params.leaseStartDate,
    lease_end_date: params.leaseEndDate
  };
}

export async function createTenantInviteLink(params: {
  email: string;
  metadata: TenantInviteMetadata;
}) {
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  return admin.auth.admin.generateLink({
    type: "invite",
    email: params.email,
    options: {
      data: params.metadata,
      redirectTo: `${appUrl}/auth/callback`
    }
  });
}

export async function fallbackToSupabaseInvite(params: {
  email: string;
  metadata: TenantInviteMetadata;
}) {
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  return admin.auth.admin.inviteUserByEmail(params.email, {
    data: params.metadata,
    redirectTo: `${appUrl}/auth/callback`
  });
}

export async function buildTenantResendPayload(params: {
  currentUserId: string;
  invitation: TenantInvitationRecord;
}) {
  if (!params.invitation.property_id) {
    return null;
  }

  const admin = createAdminClient();
  let metadata: Record<string, unknown> | undefined;

  if (params.invitation.invited_profile_id) {
    const { data: invitedUserData } = await admin.auth.admin.getUserById(
      params.invitation.invited_profile_id
    );
    metadata = invitedUserData.user?.user_metadata as Record<string, unknown> | undefined;
  }

  const unitId = readInviteMetadataString(metadata, "unit_id") ?? undefined;
  const inviteContext = await getTenantInviteContext({
    userId: params.currentUserId,
    propertyId: params.invitation.property_id,
    unitId
  });

  if ("error" in inviteContext) {
    return null;
  }

  const propertyAddress = buildPropertyAddress(inviteContext.property);
  const unitLabel =
    readInviteMetadataString(metadata, "unit_label") ?? inviteContext.unit?.unit_number ?? undefined;
  const monthlyRentCents = readInviteMetadataNumber(metadata, "monthly_rent_cents");
  const leaseStartDate = readInviteMetadataString(metadata, "lease_start_date") ?? undefined;
  const leaseEndDate = readInviteMetadataString(metadata, "lease_end_date") ?? undefined;

  return {
    metadata: buildTenantInviteMetadata({
      fullName: params.invitation.full_name,
      propertyId: params.invitation.property_id,
      propertyName: inviteContext.property.name,
      propertyAddress,
      ownerName: inviteContext.inviterName,
      invitedBy: params.currentUserId,
      unitId,
      unitLabel,
      phone: readInviteMetadataString(metadata, "tenant_phone") ?? undefined,
      monthlyRentDollars:
        monthlyRentCents != null ? monthlyRentCents / 100 : undefined,
      leaseStartDate,
      leaseEndDate
    }),
    emailParams: {
      tenantName: params.invitation.full_name,
      tenantEmail: params.invitation.email.toLowerCase(),
      ownerName: inviteContext.inviterName,
      propertyName: inviteContext.property.name,
      propertyAddress,
      unitLabel: unitLabel ?? null,
      monthlyRent:
        monthlyRentCents != null && monthlyRentCents > 0
          ? `$${(monthlyRentCents / 100).toFixed(2)}`
          : null,
      leaseStartDate: leaseStartDate ?? null,
      leaseEndDate: leaseEndDate ?? null
    } satisfies TenantInviteEmailDraft
  };
}

export async function deleteGeneratedInviteUser(userId: string | null) {
  if (!userId) {
    return;
  }

  try {
    await createAdminClient().auth.admin.deleteUser(userId);
  } catch (error) {
    console.error("Failed to delete generated invite auth user:", error);
  }
}
