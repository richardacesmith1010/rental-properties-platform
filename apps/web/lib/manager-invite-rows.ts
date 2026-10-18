import "server-only";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getClientStateForProperty } from "@/lib/client-accounts";
import { sideEffectError } from "@/lib/logger";
import {
  acceptManagerInvites, deliverManagerInvite, grantInvitedRows, isAuthUserConfirmed,
  isUserNotFoundError, logManagerInvite, managerInviteMetadata, managerInviteRedirect
} from "@/lib/manager-invite";
import type { ManagerInviteRow } from "@/lib/manager-invite";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/app/actions/shared";

export type ResendManagerReason = "not_pending" | "already_joined" | "login_gone" | "lookup_failed"
  | "no_access" | "client_home" | "grant_failed" | "send_failed";

type ResendResult = { ok: true; invitedProfileId: string } | { ok: false; reason: ResendManagerReason };
const failed = (reason: ResendManagerReason): ResendResult => ({ ok: false, reason });

async function managerProfileId(row: ManagerInviteRow): Promise<{ id: string | null; error: boolean }> {
  if (row.invited_profile_id) return { id: row.invited_profile_id, error: false };
  const { data, error } = await createAdminClient().from("profiles")
    .select("id, role").eq("email", row.email).maybeSingle();
  return { id: data?.role === "manager" ? data.id : null, error: Boolean(error) };
}

export async function resendManagerInvite(
  row: ManagerInviteRow, options: { inviterId: string; grant: boolean }
): Promise<ResendResult> {
  if (row.status !== "pending") return failed("not_pending");
  const profile = await managerProfileId(row);
  if (profile.error || !profile.id) return failed("lookup_failed");
  const profileId = profile.id;
  const admin = createAdminClient();
  const home = await admin.from("properties").select("id, name").eq("id", row.property_id).maybeSingle();
  if (home.error || !home.data) return failed("lookup_failed");
  try {
    if (!await canUserAdministerProperty(options.inviterId, row.property_id)) return failed("no_access");
  } catch {
    return failed("lookup_failed");
  }
  try {
    if ((await getClientStateForProperty(row.property_id))?.managedClient) return failed("client_home");
  } catch {
    return failed("lookup_failed");
  }
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (isUserNotFoundError(error) || (!error && !data?.user)) return failed("login_gone");
  if (error || !data?.user) return failed("lookup_failed");
  const user = data.user;

  const acceptConfirmed = async (): Promise<ResendResult> => {
    if (options.grant) {
      const result = await grantInvitedRows({ invitationIds: [row.id], profileId,
        inviterId: options.inviterId, accept: true });
      if (result.error) return failed("grant_failed");
      const outcome = result.rows.find((item) => item.invitation_id === row.id)?.outcome;
      if (outcome === "accepted" || outcome === "already_accepted") return failed("already_joined");
      return outcome === "not_pending" ? failed("not_pending") : failed("grant_failed");
    }
    const result = await acceptManagerInvites(profileId);
    if (result.error) return failed("lookup_failed");
    const outcome = result.rows.find((item) => item.invitation_id === row.id)?.outcome;
    return outcome === "no_access" ? failed("no_access") : failed("already_joined");
  };
  if (isAuthUserConfirmed(user)) return acceptConfirmed();

  if (options.grant) {
    const result = await grantInvitedRows({ invitationIds: [row.id], profileId,
      inviterId: options.inviterId, accept: false });
    if (result.error) return failed("grant_failed");
    const outcome = result.rows.find((item) => item.invitation_id === row.id)?.outcome;
    if (outcome === "not_pending") return failed("not_pending");
    if (outcome === "accepted" || outcome === "already_accepted") return failed("already_joined");
    if (outcome !== "granted") return failed("grant_failed");
  } else {
    const access = await admin.from("property_managers").select("active")
      .eq("property_id", row.property_id).eq("manager_profile_id", profileId).maybeSingle();
    if (access.error) return failed("lookup_failed");
    if (!access.data?.active) return failed("no_access");
  }
  const delivery = await deliverManagerInvite({ email: row.email, fullName: row.full_name,
    inviterId: options.inviterId, homeNames: [home.data.name], authEmail: user.email ?? null });
  if (delivery === "already_joined") return acceptConfirmed();
  if (delivery === "not_sent") return failed("send_failed");
  return { ok: true, invitedProfileId: profileId };
}

export async function revokeManagerInvite({ row, userId }: {
  row: ManagerInviteRow; userId: string;
}): Promise<ActionState> {
  if (row.status === "expired") return { success: false, error: "This invite was already revoked." };
  if (row.status === "accepted") {
    return { success: false, error: "They already signed in. This invite can't be revoked." };
  }
  try {
    if ((await getClientStateForProperty(row.property_id))?.managedClient) {
      return { success: false, error: "This home's managers are set by its client account." };
    }
  } catch {
    return { success: false, error: "Failed to revoke invitation." };
  }
  const profile = await managerProfileId(row);
  if (profile.error) return { success: false, error: "Failed to revoke invitation." };
  const profileId = profile.id;
  const admin = createAdminClient();
  let unconfirmed = false;
  let authEmail: string | null = null;
  if (profileId) {
    const { data, error } = await admin.auth.admin.getUserById(profileId);
    if (error && !isUserNotFoundError(error)) {
      return { success: false, error: "Failed to revoke invitation." };
    }
    if (!error && data?.user) {
      unconfirmed = !isAuthUserConfirmed(data.user);
      authEmail = data.user.email ?? null;
    }
  }
  const { data, error } = await admin.rpc("manager_invite_revoke", {
    p_invitation_id: row.id, p_inviter_id: userId
  });
  const result = data?.[0];
  if (error || !result || !["revoked", "already_revoked", "accepted", "not_found"].includes(result.outcome)
    || typeof result.released !== "boolean" || typeof result.other_live !== "boolean"
    || typeof result.kept_direct !== "boolean" || result.outcome === "not_found") {
    logManagerInvite("revoke_failed", error ?? { message: "No invitation was revoked." });
    return { success: false, error: "Failed to revoke invitation." };
  }
  if (result.outcome === "already_revoked") {
    return { success: false, error: "This invite was already revoked." };
  }
  if (result.outcome === "accepted") {
    revalidatePath("/owner");
    revalidatePath("/manager");
    return { success: false, error: "They already signed in. This invite can't be revoked." };
  }
  if (result.outcome !== "revoked") {
    logManagerInvite("revoke_failed", { message: "Unknown revoke outcome." });
    return { success: false, error: "Failed to revoke invitation." };
  }

  let linkReset = false;
  if (profileId && unconfirmed) {
    if (authEmail?.toLowerCase() === row.email) {
      const remaining = await admin.from("invitations").select("id")
        .eq("role", "manager").eq("email", row.email).eq("status", "pending")
        .neq("id", row.id).limit(1);
      if (remaining.error) logManagerInvite("link_reset_failed", remaining.error);
      else if (!remaining.data?.length) {
        const reset = await admin.auth.admin.generateLink({ type: "invite", email: row.email,
          options: { data: managerInviteMetadata(row.full_name), redirectTo: managerInviteRedirect() } });
        if (reset.error) logManagerInvite("link_reset_failed", reset.error);
        else linkReset = true;
      }
    } else logManagerInvite("link_reset_failed", { message: "Auth email does not match invite email." });
  }
  void logAudit({ userId, action: "revoke_manager_invite", entityType: "invitation", entityId: row.id,
    metadata: { propertyId: row.property_id, managerProfileId: profileId,
      accessRemoved: result.released, linkReset } })
    .catch(sideEffectError("revokeInvite", "log_audit", {
      userId, entityType: "invitation", entityId: row.id
    }));
  revalidatePath("/owner");
  revalidatePath("/manager");
  const message = result.other_live ? "Invitation revoked. Another invite still gives them this home."
    : result.kept_direct ? "Invitation revoked. They still manage this home." : "Invitation revoked.";
  return { success: true, message };
}
