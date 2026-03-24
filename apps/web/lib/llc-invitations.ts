import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";

export const LLC_INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LLCInvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface LLCInvitationDTO {
  id: string;
  ownershipAccountId: string;
  invitedBy: string;
  email: string;
  token: string;
  status: LLCInvitationStatus;
  createdAt: string;
  acceptedAt: string | null;
}

export interface LLCInvitationContext {
  id: string;
  accountId: string;
  accountName: string;
  invitedBy: string;
  invitedByName: string | null;
  email: string;
  token: string;
  status: LLCInvitationStatus;
  createdAt: string;
  acceptedAt: string | null;
  isExpired: boolean;
}

export interface ParsedInvitationEmails {
  emails: string[];
  invalidEmails: string[];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseInvitationEmails(rawValue: string): ParsedInvitationEmails {
  const segments = rawValue
    .split(/[\n,]+/)
    .map((value) => normalizeInvitationEmail(value))
    .filter(Boolean);

  const emails = unique(segments.filter((value) => EMAIL_PATTERN.test(value)));
  const invalidEmails = unique(segments.filter((value) => !EMAIL_PATTERN.test(value)));

  return { emails, invalidEmails };
}

export function isInvitationExpired(
  createdAt: string | Date,
  nowValue: string | Date = new Date()
) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (Number.isNaN(created.getTime()) || Number.isNaN(now.getTime())) {
    return true;
  }

  return now.getTime() - created.getTime() > LLC_INVITATION_EXPIRY_MS;
}

export async function canUserManageLLCInvitations(userId: string, accountId: string) {
  const admin = createAdminClient();
  const [{ data: member, error: memberError }, { data: account, error: accountError }] = await Promise.all([
    admin
      .from("ownership_account_members")
      .select("member_role, active")
      .eq("account_id", accountId)
      .eq("profile_id", userId)
      .maybeSingle(),
    admin
      .from("ownership_accounts")
      .select("created_by_profile_id")
      .eq("id", accountId)
      .maybeSingle()
  ]);

  if ((memberError && isMissingSchemaError(memberError)) || (accountError && isMissingSchemaError(accountError))) {
    return false;
  }

  if (memberError) {
    console.error("canUserManageLLCInvitations membership error:", memberError);
    return false;
  }

  if (accountError) {
    console.error("canUserManageLLCInvitations account error:", accountError);
    return false;
  }

  if (account?.created_by_profile_id === userId) {
    return true;
  }

  return Boolean(member?.active && (member.member_role === "owner" || member.member_role === "admin"));
}

export async function getPendingLLCInvitationsForAccount(
  userId: string,
  accountId: string
): Promise<LLCInvitationDTO[]> {
  const canAccess = await canUserAdministerOwnershipAccount(userId, accountId);
  if (!canAccess) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("llc_invitations")
    .select("id, ownership_account_id, invited_by, email, token, status, created_at, accepted_at")
    .eq("ownership_account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getPendingLLCInvitationsForAccount error:", error);
    }
    return [];
  }

  return (data ?? []).map((invitation) => ({
    id: invitation.id,
    ownershipAccountId: invitation.ownership_account_id,
    invitedBy: invitation.invited_by,
    email: invitation.email,
    token: invitation.token,
    status: invitation.status as LLCInvitationStatus,
    createdAt: invitation.created_at,
    acceptedAt: invitation.accepted_at ?? null
  }));
}

export async function getLLCInvitationContextByToken(
  token: string
): Promise<LLCInvitationContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("llc_invitations")
    .select(
      "id, ownership_account_id, invited_by, email, token, status, created_at, accepted_at, ownership_accounts(display_name), profiles!llc_invitations_invited_by_fkey(full_name)"
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getLLCInvitationContextByToken error:", error);
    }
    return null;
  }

  if (!data) {
    return null;
  }

  const invitationRow = data as typeof data & {
    ownership_accounts?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
    profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
  };

  const isExpired = invitationRow.status === "pending" && isInvitationExpired(invitationRow.created_at);
  if (isExpired) {
    const { error: expireError } = await admin
      .from("llc_invitations")
      .update({ status: "expired" })
      .eq("id", invitationRow.id)
      .eq("status", "pending");

    if (expireError && !isMissingSchemaError(expireError)) {
      console.error("getLLCInvitationContextByToken expire error:", expireError);
    }
  }

  const ownershipAccountRelation = invitationRow.ownership_accounts as
    | { display_name?: string | null }
    | Array<{ display_name?: string | null }>
    | null
    | undefined;
  const inviterProfileRelation = invitationRow.profiles as
    | { full_name?: string | null }
    | Array<{ full_name?: string | null }>
    | null
    | undefined;

  const accountName = Array.isArray(ownershipAccountRelation)
    ? ownershipAccountRelation[0]?.display_name
    : ownershipAccountRelation?.display_name;
  const inviterName = Array.isArray(inviterProfileRelation)
    ? inviterProfileRelation[0]?.full_name
    : inviterProfileRelation?.full_name;

  return {
    id: invitationRow.id,
    accountId: invitationRow.ownership_account_id,
    accountName: accountName ?? "Your LLC",
    invitedBy: invitationRow.invited_by,
    invitedByName: inviterName ?? null,
    email: invitationRow.email,
    token: invitationRow.token,
    status: isExpired ? "expired" : (invitationRow.status as LLCInvitationStatus),
    createdAt: invitationRow.created_at,
    acceptedAt: invitationRow.accepted_at ?? null,
    isExpired
  };
}

export async function getExistingProfileByEmail(email: string): Promise<{
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  onboardingCompletedAt: string | null;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, onboarding_completed_at")
    .eq("email", normalizeInvitationEmail(email))
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error("getExistingProfileByEmail error:", error);
    }
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name ?? null,
    role: data.role ?? null,
    onboardingCompletedAt: data.onboarding_completed_at ?? null
  };
}

export async function acceptLLCInvitationMembership(params: {
  invitation: LLCInvitationContext;
  profileId: string;
  email: string;
  fullName?: string | null;
  nickname?: string | null;
}) {
  const admin = createAdminClient();
  const acceptedAt = new Date().toISOString();
  const normalizedEmail = normalizeInvitationEmail(params.email);
  const existingProfile = await getExistingProfileByEmail(normalizedEmail);
  const fullName = params.fullName?.trim() || existingProfile?.fullName || normalizedEmail.split("@")[0];
  const nickname = params.nickname?.trim() || fullName.split(/\s+/)[0] || normalizedEmail.split("@")[0];

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: params.profileId,
      email: normalizedEmail,
      full_name: fullName,
      nickname,
      role: "owner",
      onboarding_completed_at: existingProfile?.onboardingCompletedAt ?? acceptedAt
    },
    { onConflict: "id" }
  );

  if (profileError) {
    if (isMissingSchemaError(profileError)) {
      return { success: false as const, error: "This feature requires a database update before invites can be accepted." };
    }
    console.error("acceptLLCInvitationMembership profile error:", profileError);
    return { success: false as const, error: "Unable to update the invited member profile." };
  }

  const { error: memberError } = await admin.from("ownership_account_members").upsert(
    {
      account_id: params.invitation.accountId,
      profile_id: params.profileId,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (memberError) {
    if (isMissingSchemaError(memberError)) {
      return { success: false as const, error: "This feature requires a database update before invites can be accepted." };
    }
    console.error("acceptLLCInvitationMembership member error:", memberError);
    return { success: false as const, error: "Unable to attach this member to the LLC." };
  }

  const { error: invitationError } = await admin
    .from("llc_invitations")
    .update({ status: "accepted", accepted_at: acceptedAt })
    .eq("id", params.invitation.id)
    .in("status", ["pending", "accepted"]);

  if (invitationError) {
    if (isMissingSchemaError(invitationError)) {
      return { success: false as const, error: "This feature requires a database update before invites can be accepted." };
    }
    console.error("acceptLLCInvitationMembership invitation error:", invitationError);
    return { success: false as const, error: "Member added, but the invitation could not be marked accepted." };
  }

  return { success: true as const, accountId: params.invitation.accountId };
}
