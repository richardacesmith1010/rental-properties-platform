import "server-only";

import { sendManagerInviteEmail, canSendBrandedManagerInvite } from "@/lib/invite-email";
import { createAdminClient } from "@/lib/supabase/admin";

export type ManagerInviteRow = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  property_id: string;
  invited_profile_id: string | null;
};

export type GrantOutcome = "granted" | "accepted" | "already_accepted" | "not_pending";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasText = (row: Record<string, unknown>, key: string) => typeof row[key] === "string";
const validRows = <T>(value: unknown, check: (row: Record<string, unknown>) => boolean): value is T[] =>
  Array.isArray(value) && value.every((row) => isRecord(row) && check(row));

export function managerInviteRedirect(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`;
}

export function managerInviteUrl(hashedToken: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/confirm?token_hash=${
    encodeURIComponent(hashedToken)
  }&type=invite`;
}

export function managerInviteMetadata(fullName: string) {
  return { role: "manager", full_name: fullName };
}

export function managerInviteAppMetadata() {
  return { domus_manager_invite: true };
}

export function isAuthUserConfirmed(user: {
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
} | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at || user?.phone_confirmed_at);
}

export function isDomusManagerInvitee(user: {
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown>;
} | null | undefined): boolean {
  return user?.app_metadata?.domus_manager_invite === true && !isAuthUserConfirmed(user);
}

export function isEmailExistsError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "email_exists";
}

export function isUserNotFoundError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "user_not_found";
}

export function logManagerInvite(tag: string, error: unknown): void {
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string } : null;
  console.error(`[manager-invite] ${tag}`, {
    code: detail?.code ?? null,
    message: detail?.message ?? String(error)
  });
}

export async function writeManagerRows(p: {
  email: string;
  fullName: string;
  inviterId: string;
  propertyIds: string[];
  profileId: string;
}): Promise<{ error: unknown | null; rows: Array<{ id: string; property_id: string }> }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const updated = await admin.from("invitations")
    .update({ status: "pending", full_name: p.fullName, accepted_at: null,
      invited_profile_id: p.profileId, ownership_account_id: null, created_at: now })
    .eq("email", p.email).eq("role", "manager").eq("invited_by", p.inviterId)
    .in("property_id", p.propertyIds).in("status", ["pending", "expired"])
    .select("id, property_id");
  if (updated.error) {
    logManagerInvite("rows_failed", updated.error);
    return { error: updated.error, rows: [] };
  }
  const rows = updated.data ?? [];
  const found = new Set(rows.map((row) => row.property_id));
  const missing = p.propertyIds.filter((id) => !found.has(id));
  if (!missing.length) return { error: null, rows };

  const inserted = await admin.from("invitations").upsert(
    missing.map((propertyId) => ({ email: p.email, full_name: p.fullName, role: "manager",
      property_id: propertyId, invited_by: p.inviterId, status: "pending",
      invited_profile_id: p.profileId, created_at: now })),
    { onConflict: "email,role,invited_by,property_id", ignoreDuplicates: true }
  ).select("id, property_id");
  if (inserted.error) {
    logManagerInvite("rows_failed", inserted.error);
    return { error: inserted.error, rows: [] };
  }
  return { error: null, rows: [...rows, ...(inserted.data ?? [])] };
}

export async function grantInvitedRows(p: {
  invitationIds: string[];
  profileId: string;
  inviterId: string;
  accept: boolean;
}): Promise<{ error: unknown | null; rows: Array<{
  invitation_id: string; property_id: string; outcome: GrantOutcome;
}> }> {
  const { data, error } = await createAdminClient().rpc("manager_invite_grant", {
    p_invitation_ids: p.invitationIds, p_profile_id: p.profileId,
    p_inviter_id: p.inviterId, p_accept: p.accept
  });
  const resultError = error ?? (validRows(data, (row) => hasText(row, "invitation_id")
    && hasText(row, "property_id")
    && typeof row.outcome === "string"
    && ["granted", "accepted", "already_accepted", "not_pending"].includes(row.outcome))
    ? null : { message: "Invalid grant result." });
  if (resultError) logManagerInvite("grant_failed", resultError);
  return { error: resultError, rows: resultError ? [] : data };
}

export async function grantNewHomes(profileId: string, propertyIds: string[]): Promise<{
  error: unknown | null; rows: Array<{ property_id: string; added: boolean }>;
}> {
  const { data, error } = await createAdminClient().rpc("manager_grant_homes", {
    p_profile_id: profileId, p_property_ids: propertyIds
  });
  const resultError = error ?? (validRows(data, (row) => hasText(row, "property_id")
    && typeof row.added === "boolean") ? null : { message: "Invalid grant result." });
  if (resultError) logManagerInvite("grant_failed", resultError);
  return { error: resultError, rows: resultError ? [] : data };
}

export async function acceptManagerInvites(profileId: string): Promise<{
  error: unknown | null;
  rows: Array<{ invitation_id: string; property_id: string; outcome: "accepted" | "no_access" }>;
}> {
  const { data, error } = await createAdminClient().rpc("manager_invite_accept", { p_profile_id: profileId });
  const resultError = error ?? (validRows(data, (row) => hasText(row, "invitation_id")
    && hasText(row, "property_id") && typeof row.outcome === "string"
    && ["accepted", "no_access"].includes(row.outcome))
    ? null : { message: "Invalid accept result." });
  if (resultError) logManagerInvite("accept_failed", resultError);
  return { error: resultError, rows: resultError ? [] : data };
}

export async function deliverManagerInvite(p: {
  email: string;
  fullName: string;
  inviterId: string;
  homeNames: string[];
  authEmail: string | null;
}): Promise<"email_branded" | "email_basic" | "already_joined" | "not_sent"> {
  if (p.authEmail?.toLowerCase() !== p.email) {
    logManagerInvite("send_failed", { message: "Auth email does not match invite email." });
    return "not_sent";
  }
  try {
    const admin = createAdminClient();
    if (canSendBrandedManagerInvite(p.email)) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite", email: p.email,
        options: { data: managerInviteMetadata(p.fullName), redirectTo: managerInviteRedirect() }
      });
      if (isEmailExistsError(error)) return "already_joined";
      if (!error && data?.properties?.hashed_token) {
        const inviter = await admin.from("profiles").select("full_name").eq("id", p.inviterId).maybeSingle();
        if (inviter.error) logManagerInvite("inviter_lookup_failed", inviter.error);
        const sent = await sendManagerInviteEmail({
          email: p.email, inviterName: inviter.data?.full_name || "Someone", homeNames: p.homeNames,
          inviteUrl: managerInviteUrl(data.properties.hashed_token)
        });
        if (sent) return "email_branded";
      }
    }
    const { error } = await admin.auth.admin.inviteUserByEmail(p.email, {
      redirectTo: managerInviteRedirect(), data: managerInviteMetadata(p.fullName)
    });
    if (!error) return "email_basic";
    if (isEmailExistsError(error)) return "already_joined";
    logManagerInvite("send_failed", error);
    return "not_sent";
  } catch (error) {
    logManagerInvite("send_failed", error);
    return "not_sent";
  }
}
