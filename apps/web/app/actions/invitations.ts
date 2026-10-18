"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { getClientState } from "@/lib/client-accounts";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  deliverManagerInvite, grantInvitedRows, grantNewHomes, isAuthUserConfirmed,
  isDomusManagerInvitee, isEmailExistsError, isUserNotFoundError, logManagerInvite,
  managerInviteAppMetadata, managerInviteMetadata, writeManagerRows
} from "@/lib/manager-invite";
import { inviteManagerSchema, inviteOwnerSchema, parseFormData } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function inviteManager(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const inviteRate = checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations sent. Please try again later." };
  }
  const parsed = parseFormData(inviteManagerSchema, formData);
  if (!parsed.success) return parsed;
  const { email, fullName, propertyIds } = parsed.data;
  const admin = createAdminClient();

  const allowed = new Set(await getAdministeredPropertyIds(user.id));
  if (propertyIds.some((id) => !allowed.has(id))) {
    return { success: false, error: "Property not found." };
  }
  const properties = await admin.from("properties").select("id, name, owner_account_id").in("id", propertyIds);
  if (properties.error || properties.data?.length !== propertyIds.length) {
    return { success: false, error: "Property not found." };
  }
  const accountIds = Array.from(new Set(properties.data.map((home) => home.owner_account_id).filter(Boolean)));
  if (accountIds.length) {
    const accounts = await admin.from("ownership_accounts").select("id, managed_client").in("id", accountIds);
    if (accounts.error) {
      return { success: false, error: "Unable to check this home's client account." };
    }
    if (accounts.data?.some((account) => account.managed_client)) {
      return { success: false, error: "This home's managers are set by its client account." };
    }
  }
  const homeName = new Map(properties.data.map((home) => [home.id, home.name]));
  const profileLookup = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (profileLookup.error) {
    return { success: false, error: "Could not check this email. Try again." };
  }

  let profileId: string;
  let authEmail: string | null;
  if (profileLookup.data) {
    if (profileLookup.data.role !== "manager") {
      return { success: false, error: "A user with this email already exists with a different role." };
    }
    profileId = profileLookup.data.id;
    const found = await admin.auth.admin.getUserById(profileId);
    if (found.error && !isUserNotFoundError(found.error)) {
      return { success: false, error: "Could not check this email. Try again." };
    }
    if (isUserNotFoundError(found.error) || !found.data?.user) {
      return { success: false, error: "Could not find this person's account. Try a different email." };
    }
    if (isAuthUserConfirmed(found.data.user)) {
      const before = await admin.from("property_managers").select("property_id, active")
        .eq("manager_profile_id", profileId).in("property_id", propertyIds);
      if (before.error) {
        return { success: false, error: "Unable to check manager access. Please try again." };
      }
      const activeBefore = new Set((before.data ?? []).filter((row) => row.active).map((row) => row.property_id));
      const ownRows = await admin.from("invitations").select("id, property_id, status")
        .eq("invited_by", user.id).eq("email", email).eq("role", "manager").in("property_id", propertyIds);
      if (ownRows.error) {
        return { success: false, error: "Unable to check manager access. Please try again." };
      }
      const expiredIds = (ownRows.data ?? []).filter((row) => row.status === "expired").map((row) => row.id);
      if (expiredIds.length) {
        const reopened = await admin.from("invitations")
          .update({ status: "pending", accepted_at: null, invited_profile_id: profileId })
          .in("id", expiredIds).eq("status", "expired");
        if (reopened.error) {
          return { success: false, error: "Failed to assign manager to property." };
        }
      }
      const existingHomes = new Set((ownRows.data ?? []).map((row) => row.property_id));
      const newHomes = propertyIds.filter((id) => !existingHomes.has(id));
      const direct = newHomes.length ? await grantNewHomes(profileId, newHomes) : { error: null, rows: [] };
      if (direct.error) return { success: false, error: "Failed to assign manager to property." };
      const rowIds = (ownRows.data ?? []).map((row) => row.id);
      const granted = rowIds.length
        ? await grantInvitedRows({ invitationIds: rowIds, profileId, inviterId: user.id, accept: true })
        : { error: null, rows: [] };
      if (granted.error) return { success: false, error: "Failed to assign manager to property." };
      const dropped = new Set(granted.rows.filter((row) => row.outcome === "not_pending").map((row) => row.property_id));
      const kept = propertyIds.filter((id) => !dropped.has(id));
      if (!kept.length) return { success: false, error: "This invite was revoked. Send a new invite." };
      const added = [
        ...direct.rows.filter((row) => row.added).map((row) => row.property_id),
        ...granted.rows.filter((row) => row.outcome === "accepted" && !activeBefore.has(row.property_id))
          .map((row) => row.property_id)
      ];
      const delivery = added.length ? "added" : "already";
      void logAudit({ userId: user.id, action: "invite_manager", entityType: "invitation",
        metadata: { propertyIds, addedPropertyIds: added, tenantEmail: email, managerProfileId: profileId, delivery }
      }).catch(sideEffectError("inviteManager", "log_audit", {
        userId: user.id, entityType: "invitation", entityId: profileId
      }));
      revalidatePath("/owner");
      revalidatePath("/manager");
      const name = fullName || email;
      const message = !added.length
        ? `${name} already has access to ${kept.length === 1 ? "this home" : "these homes"}. No email was sent.`
        : kept.length === 1
          ? `Added ${name} to this home. They'll see it next time they sign in.`
          : `Added ${name} to ${added.length} ${added.length === 1 ? "home" : "homes"}. They'll see ${
            added.length === 1 ? "it" : "them"
          } next time they sign in.`;
      const result = { success: true, delivery, message, email, name: fullName } as const;
      return result;
    }
    if (!isDomusManagerInvitee(found.data.user)) {
      logManagerInvite("self_signup_blocked", { message: "Unmarked manager account." });
      return { success: false, error: "We can't invite this email right now. Try a different email." };
    }
    authEmail = found.data.user.email ?? null;
  } else {
    const pending = await admin.from("invitations").select("id").eq("email", email)
      .eq("status", "pending").limit(1);
    if (pending.error) return { success: false, error: "Could not check this email. Try again." };
    if (pending.data?.length) {
      logManagerInvite("stale_pending_row", { message: "Pending row without a profile." });
      return { success: false, error: "We can't invite this email right now. Try a different email." };
    }
    const created = await admin.auth.admin.createUser({ email, email_confirm: false,
      user_metadata: managerInviteMetadata(fullName), app_metadata: managerInviteAppMetadata() });
    if (created.data?.user?.id && !created.error) {
      profileId = created.data.user.id;
      authEmail = created.data.user.email ?? null;
    } else if (isEmailExistsError(created.error)) {
      logManagerInvite("auth_failed", created.error);
      return { success: false, error: "Could not check this email. Try again." };
    } else {
      logManagerInvite("auth_failed", created.error ?? { message: "Auth user missing." });
      const retryProfile = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
      if (retryProfile.error || retryProfile.data?.role !== "manager") {
        return { success: false, error: "Failed to send invitation. Please try again." };
      }
      const retryUser = await admin.auth.admin.getUserById(retryProfile.data.id);
      if (retryUser.error || !isDomusManagerInvitee(retryUser.data?.user)) {
        return { success: false, error: "Failed to send invitation. Please try again." };
      }
      profileId = retryProfile.data.id;
      authEmail = retryUser.data.user?.email ?? null;
    }
  }

  const written = await writeManagerRows({ email, fullName, inviterId: user.id, propertyIds, profileId });
  if (written.error) return { success: false, error: "Could not save the invite. Press Send again." };
  const granted = written.rows.length
    ? await grantInvitedRows({ invitationIds: written.rows.map((row) => row.id), profileId,
      inviterId: user.id, accept: false })
    : { error: null, rows: [] };
  if (granted.error) return { success: false, error: "Could not add access. Press Send again." };
  const dropped = new Set(granted.rows.filter((row) => row.outcome === "not_pending").map((row) => row.property_id));
  const kept = propertyIds.filter((id) => !dropped.has(id));
  if (!kept.length) return { success: false, error: "This invite was revoked. Send a new invite." };
  const delivery = await deliverManagerInvite({ email, fullName, inviterId: user.id,
    homeNames: kept.map((id) => homeName.get(id) ?? ""), authEmail });
  let acceptFailed = false;
  if (delivery === "already_joined") {
    const keptRows = written.rows.filter((row) => !dropped.has(row.property_id));
    const accepted = keptRows.length
      ? await grantInvitedRows({ invitationIds: keptRows.map((row) => row.id), profileId,
        inviterId: user.id, accept: true })
      : { error: null, rows: [] };
    acceptFailed = Boolean(accepted.error);
  }
  const result = acceptFailed
    ? { success: false, error: "Access is set. The list did not update. Press Send again." } as const
    : delivery === "already_joined"
      ? { success: true, delivery: "already_joined", message: `Added ${fullName || email}. They already signed in.`,
        email, name: fullName } as const
      : delivery === "not_sent"
        ? { success: false, error: "Access added. The email did not send. Press Send again." } as const
        : { success: true, delivery: "email", message: `Invite sent to ${email}. They'll get an email from Domus.`,
          email, name: fullName } as const;
  void logAudit({ userId: user.id, action: "invite_manager", entityType: "invitation",
    metadata: { propertyIds, tenantEmail: email, managerProfileId: profileId, delivery }
  }).catch(sideEffectError("inviteManager", "log_audit", {
    userId: user.id, entityType: "invitation", entityId: profileId
  }));
  revalidatePath("/owner");
  revalidatePath("/manager");
  return result;
}

export async function inviteOwner(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");

  const inviteRate = checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations sent. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(inviteOwnerSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName, ownershipAccountId } = parsed.data;
  const admin = createAdminClient();
  const normalizedEmail = email.toLowerCase();

  try {
    const client = await getClientState(ownershipAccountId);
    if (client?.managedClient) {
      return { success: false, error: client.claimState === "unclaimed"
        ? "This client can't have owners yet."
        : "This client's owners are set by its client account." };
    }
  } catch {
    return { success: false, error: "Unable to check this client account." };
  }

  if (!(await canUserAdministerOwnershipAccount(user.id, ownershipAccountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingProfile && existingProfile.role !== "owner") {
    return {
      success: false,
      error: "This email already belongs to a non-owner profile."
    };
  }

  if (existingProfile?.id) {
    const { error } = await admin.from("ownership_account_members").upsert(
      {
        account_id: ownershipAccountId,
        profile_id: existingProfile.id,
        member_role: "owner",
        can_receive_critical_alerts: true,
        active: true
      },
      { onConflict: "account_id,profile_id" }
    );

    if (error) {
      return { success: false, error: "Failed to add co-owner to this account." };
    }

    void logAudit({
      userId: user.id,
      action: "invite_owner",
      entityType: "invitation",
      metadata: {
        ownershipAccountId,
        tenantEmail: normalizedEmail,
        ownerProfileId: existingProfile.id
      }
    }).catch(
      sideEffectError("inviteOwner", "log_audit", {
        userId: user.id,
        entityType: "invitation",
        entityId: existingProfile.id
      })
    );

    revalidatePath("/owner");
    revalidatePath("/manager");
    return { success: true };
  }

  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("email", normalizedEmail)
    .eq("role", "owner")
    .eq("ownership_account_id", ownershipAccountId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite?.id) {
    return { success: false, error: "An owner invitation is already pending for this account." };
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback`,
    data: {
      role: "owner",
      full_name: fullName,
      ownership_account_id: ownershipAccountId
    }
  });

  if (inviteError) {
    return { success: false, error: "Failed to send owner invitation." };
  }

  const { error: ownerInviteInsertError } = await admin.from("invitations").insert({
    email: normalizedEmail,
    full_name: fullName,
    role: "owner",
    invited_by: user.id,
    ownership_account_id: ownershipAccountId,
    status: "pending"
  });

  if (ownerInviteInsertError) {
    console.error("Failed to track owner invitation:", ownerInviteInsertError);
  }

  void logAudit({
    userId: user.id,
    action: "invite_owner",
    entityType: "invitation",
    metadata: {
      ownershipAccountId,
      tenantEmail: normalizedEmail
    }
  }).catch(
    sideEffectError("inviteOwner", "log_audit", {
      userId: user.id,
      entityType: "invitation",
      entityId: ownershipAccountId
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
