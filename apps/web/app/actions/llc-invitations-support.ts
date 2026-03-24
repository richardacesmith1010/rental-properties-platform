import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  acceptLLCInvitationMembership,
  getLLCInvitationContextByToken,
  type LLCInvitationContext,
  normalizeInvitationEmail
} from "@/lib/llc-invitations";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const LLC_INVITATIONS_SCHEMA_ERROR =
  "This feature requires a database update before LLC invitations can be used.";

export type InvitationLookupResult =
  | { invitation: LLCInvitationContext }
  | { error: string };

export type InvitationAcceptanceResult =
  | { success: true; accountId: string }
  | { success: false; error: string };

export type InviteManagementContextResult =
  | { account: { id: string; display_name: string }; inviterName: string }
  | { error: string };

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
}

export function buildInviteUrl(token: string) {
  return `${getAppUrl()}/join-llc?token=${encodeURIComponent(token)}`;
}

export function buildJoinRedirect(token: string, mode: "signin" | "signup", error: string) {
  return `/join-llc?token=${encodeURIComponent(token)}&mode=${mode}&error=${encodeURIComponent(error)}`;
}

export function getNickname(firstName: string) {
  return firstName.trim() || "Owner";
}

export function buildInvitationResultMessage(params: {
  sent: number;
  skipped: string[];
  failed: string[];
}) {
  const segments: string[] = [];

  if (params.sent > 0) {
    segments.push(`Sent ${params.sent} invitation${params.sent === 1 ? "" : "s"}.`);
  }
  if (params.skipped.length > 0) {
    segments.push(params.skipped.join(" "));
  }
  if (params.failed.length > 0) {
    segments.push(`Email delivery failed for ${params.failed.join(", ")}.`);
  }

  return segments.join(" ") || "No new invitations were sent.";
}

export async function loadInviteManagementContext(
  accountId: string,
  userId: string
): Promise<InviteManagementContextResult> {
  const admin = createAdminClient();
  const [{ data: account, error: accountError }, { data: inviter, error: inviterError }] =
    await Promise.all([
      admin
        .from("ownership_accounts")
        .select("id, display_name")
        .eq("id", accountId)
        .maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle()
    ]);

  if ((accountError && isMissingSchemaError(accountError)) || (inviterError && isMissingSchemaError(inviterError))) {
    return { error: LLC_INVITATIONS_SCHEMA_ERROR } as const;
  }

  if (accountError) {
    console.error("loadInviteManagementContext account error:", accountError);
    return { error: "Unable to load this LLC account right now." } as const;
  }

  if (inviterError) {
    console.error("loadInviteManagementContext inviter error:", inviterError);
    return { error: "Unable to load your profile right now." } as const;
  }

  if (!account) {
    return { error: "LLC account not found." } as const;
  }

  return {
    account,
    inviterName: inviter?.full_name?.trim() || "A Domus owner"
  } as const;
}

export function revalidateLlcSurfaces() {
  revalidatePath("/owner");
  revalidatePath("/manager");
}

export async function resolveInvitationForAcceptance(
  token: string
): Promise<InvitationLookupResult> {
  const invitation = await getLLCInvitationContextByToken(token);
  if (!invitation) {
    return { error: "This invitation is invalid." } satisfies InvitationLookupResult;
  }

  if (invitation.status === "expired" || invitation.isExpired) {
    return { error: "This invitation has expired." } satisfies InvitationLookupResult;
  }

  if (invitation.status !== "pending") {
    return { error: "This invitation is no longer active." } satisfies InvitationLookupResult;
  }

  return { invitation } satisfies InvitationLookupResult;
}

export async function finalizeInvitationAcceptance(params: {
  token: string;
  profileId: string;
  email: string;
  fullName?: string | null;
  nickname?: string | null;
}): Promise<InvitationAcceptanceResult> {
  const invitationResult = await resolveInvitationForAcceptance(params.token);
  if ("error" in invitationResult) {
    return {
      success: false,
      error: invitationResult.error ?? "This invitation is no longer available."
    };
  }

  const normalizedInvitationEmail = normalizeInvitationEmail(invitationResult.invitation.email);
  if (normalizeInvitationEmail(params.email) !== normalizedInvitationEmail) {
    return { success: false, error: "This invitation was sent to a different email address." };
  }

  const result = await acceptLLCInvitationMembership({
    invitation: invitationResult.invitation,
    profileId: params.profileId,
    email: params.email,
    fullName: params.fullName,
    nickname: params.nickname
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, accountId: result.accountId };
}
