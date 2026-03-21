"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { sendTenantInviteEmail } from "@/lib/invite-email";
import { sideEffectError } from "@/lib/logger";
import { notifyOwnerMembersOfAcceptedTenantInvite } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  inviteTenantSchema,
  resendInviteSchema,
  revokeInviteSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import {
  buildPropertyAddress,
  buildTenantInviteMetadata,
  buildTenantResendPayload,
  createTenantInviteLink,
  deleteGeneratedInviteUser,
  fallbackToSupabaseInvite,
  getTenantInviteContext,
  normalizeOptionalString
} from "./tenant-invitation-support";
import type { ActionState } from "./shared";

export async function inviteTenant(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");

  const inviteRate = checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations sent. Please try again later." };
  }

  const parsed = parseFormData(inviteTenantSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    email,
    fullName,
    propertyId,
    unitId,
    phone,
    monthlyRentDollars,
    leaseStartDate,
    leaseEndDate
  } = parsed.data;
  const admin = createAdminClient();
  const normalizedEmail = email.toLowerCase();

  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const inviteContext = await getTenantInviteContext({ userId: user.id, propertyId, unitId });
  if ("error" in inviteContext) {
    return { success: false, error: inviteContext.error };
  }

  const propertyAddress = buildPropertyAddress(inviteContext.property);
  const unitLabel = inviteContext.unit?.unit_number ?? undefined;
  const tenantInviteMetadata = buildTenantInviteMetadata({
    fullName,
    propertyId,
    propertyName: inviteContext.property.name,
    propertyAddress,
    ownerName: inviteContext.inviterName,
    invitedBy: user.id,
    unitId,
    unitLabel,
    phone: normalizeOptionalString(phone),
    monthlyRentDollars,
    leaseStartDate: normalizeOptionalString(leaseStartDate),
    leaseEndDate: normalizeOptionalString(leaseEndDate)
  });

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.role === "tenant") {
      const { data: existingPropertyInvite } = await admin
        .from("invitations")
        .select("id, status")
        .eq("email", normalizedEmail)
        .eq("role", "tenant")
        .eq("property_id", propertyId)
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      if (!existingPropertyInvite) {
        const { error: linkInviteError } = await admin.from("invitations").insert({
          email: normalizedEmail,
          full_name: fullName,
          role: "tenant",
          property_id: propertyId,
          invited_by: user.id,
          invited_profile_id: existingProfile.id,
          status: "accepted",
          accepted_at: new Date().toISOString()
        });

        if (linkInviteError) {
          return { success: false, error: "Failed to link tenant to the property." };
        }

        void notifyOwnerMembersOfAcceptedTenantInvite(existingProfile.id).catch(
          sideEffectError("inviteTenant", "create_notification", {
            userId: user.id,
            entityType: "invitation",
            entityId: existingProfile.id
          })
        );
        void awardXp(
          user.id,
          "tenant_invited",
          XP_VALUES.tenant_invited,
          "Tenant linked to property.",
          { property_id: propertyId, tenant_profile_id: existingProfile.id }
        ).catch(
          sideEffectError("inviteTenant", "award_xp", {
            userId: user.id,
            entityType: "xp_event",
            entityId: existingProfile.id
          })
        );
        void logAudit({
          userId: user.id,
          action: "invite_tenant",
          entityType: "invitation",
          metadata: {
            propertyId,
            tenantProfileId: existingProfile.id,
            tenantEmail: normalizedEmail
          }
        }).catch(
          sideEffectError("inviteTenant", "log_audit", {
            userId: user.id,
            entityType: "invitation",
            entityId: existingProfile.id
          })
        );
      }

      revalidatePath("/owner");
      revalidatePath("/manager");
      return { success: true, message: "Tenant linked to property. Continue to lease setup." };
    }

    return {
      success: false,
      error: "A user with this email already exists with a different role."
    };
  }

  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("email", normalizedEmail)
    .eq("role", "tenant")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (existingInvite && existingInvite.status === "pending") {
    return {
      success: false,
      error: "An invitation has already been sent to this email."
    };
  }

  let invitedProfileId: string | null = null;
  const generatedInvite = await createTenantInviteLink({
    email,
    metadata: tenantInviteMetadata
  });

  if (!generatedInvite.error && generatedInvite.data.user) {
    invitedProfileId = generatedInvite.data.user.id;
    const brandedInviteSent = await sendTenantInviteEmail({
      tenantName: fullName,
      tenantEmail: normalizedEmail,
      ownerName: inviteContext.inviterName,
      propertyName: inviteContext.property.name,
      propertyAddress,
      unitLabel,
      inviteUrl: generatedInvite.data.properties.action_link,
      monthlyRent: monthlyRentDollars != null ? `$${monthlyRentDollars.toFixed(2)}` : null,
      leaseStartDate: normalizeOptionalString(leaseStartDate) ?? null,
      leaseEndDate: normalizeOptionalString(leaseEndDate) ?? null
    });

    if (!brandedInviteSent) {
      await deleteGeneratedInviteUser(invitedProfileId);
      invitedProfileId = null;

      const fallbackInvite = await fallbackToSupabaseInvite({
        email,
        metadata: tenantInviteMetadata
      });

      if (fallbackInvite.error) {
        return {
          success: false,
          error: "Failed to send invitation. Please try again."
        };
      }

      invitedProfileId = fallbackInvite.data.user?.id ?? invitedProfileId;
    }
  } else {
    const fallbackInvite = await fallbackToSupabaseInvite({
      email,
      metadata: tenantInviteMetadata
    });

    if (fallbackInvite.error) {
      return {
        success: false,
        error: "Failed to send invitation. Please try again."
      };
    }

    invitedProfileId = fallbackInvite.data.user?.id ?? null;
  }

  const { error: insertError } = await admin.from("invitations").insert({
    email: normalizedEmail,
    full_name: fullName,
    role: "tenant",
    property_id: propertyId,
    invited_by: user.id,
    invited_profile_id: invitedProfileId,
    status: "pending"
  });

  if (insertError) {
    console.error("Failed to track invitation:", insertError);
  }

  void logAudit({
    userId: user.id,
    action: "invite_tenant",
    entityType: "invitation",
    metadata: {
      propertyId,
      tenantEmail: normalizedEmail
    }
  }).catch(
    sideEffectError("inviteTenant", "log_audit", {
      userId: user.id,
      entityType: "invitation",
      entityId: propertyId
    })
  );

  void awardXp(
    user.id,
    "tenant_invited",
    XP_VALUES.tenant_invited,
    "Tenant invitation sent.",
    { property_id: propertyId, email: normalizedEmail }
  ).catch(
    sideEffectError("inviteTenant", "award_xp", {
      userId: user.id,
      entityType: "xp_event",
      entityId: propertyId
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function resendInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const inviteRate = checkRateLimit(`invite:resend:${user.id}`, 20, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations sent. Please try again later." };
  }

  const parsed = parseFormData(resendInviteSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { invitationId } = parsed.data;
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select(
      "id, email, full_name, role, status, property_id, ownership_account_id, invited_profile_id"
    )
    .eq("id", invitationId)
    .eq("invited_by", user.id)
    .single();

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  let nextInvitedProfileId = invitation.invited_profile_id ?? null;

  if (invitation.status === "accepted") {
    return { success: false, error: "This invitation has already been accepted." };
  }

  if (invitation.role === "tenant") {
    const tenantPayload = await buildTenantResendPayload({
      currentUserId: user.id,
      invitation
    });

    if (tenantPayload) {
      const generatedInvite = await createTenantInviteLink({
        email: invitation.email,
        metadata: tenantPayload.metadata
      });

      if (!generatedInvite.error && generatedInvite.data.user) {
        nextInvitedProfileId = generatedInvite.data.user.id;
        const brandedInviteSent = await sendTenantInviteEmail({
          ...tenantPayload.emailParams,
          inviteUrl: generatedInvite.data.properties.action_link
        });

        if (!brandedInviteSent) {
          await deleteGeneratedInviteUser(nextInvitedProfileId);
          nextInvitedProfileId = null;

          const fallbackInvite = await fallbackToSupabaseInvite({
            email: invitation.email,
            metadata: tenantPayload.metadata
          });

          if (fallbackInvite.error) {
            return { success: false, error: "Failed to resend invitation." };
          }

          nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
        }
      } else {
        const fallbackInvite = await fallbackToSupabaseInvite({
          email: invitation.email,
          metadata: tenantPayload.metadata
        });

        if (fallbackInvite.error) {
          return { success: false, error: "Failed to resend invitation." };
        }

        nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
      }
    } else {
      const fallbackInvite = await admin.auth.admin.inviteUserByEmail(invitation.email, {
        data: {
          role: invitation.role,
          full_name: invitation.full_name,
          property_id: invitation.property_id,
          ownership_account_id: invitation.ownership_account_id
        }
      });

      if (fallbackInvite.error) {
        return { success: false, error: "Failed to resend invitation." };
      }

      nextInvitedProfileId = fallbackInvite.data.user?.id ?? nextInvitedProfileId;
    }
  } else {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
      data: {
        role: invitation.role,
        full_name: invitation.full_name,
        property_id: invitation.property_id,
        ownership_account_id: invitation.ownership_account_id
      }
    });

    if (inviteError) {
      return { success: false, error: "Failed to resend invitation." };
    }
  }

  const { error: resendUpdateError } = await admin
    .from("invitations")
    .update({ created_at: new Date().toISOString(), invited_profile_id: nextInvitedProfileId })
    .eq("id", invitationId);

  if (resendUpdateError) {
    console.error("Failed to update invitation resend timestamp:", resendUpdateError);
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Invitation resent." };
}

export async function revokeInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const inviteRate = checkRateLimit(`invite:revoke:${user.id}`, 20, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations updated. Please try again later." };
  }

  const parsed = parseFormData(revokeInviteSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, status, invited_profile_id")
    .eq("id", parsed.data.invitationId)
    .eq("invited_by", user.id)
    .single();

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (invitation.status === "accepted") {
    return { success: false, error: "Accepted invitations cannot be revoked." };
  }

  await deleteGeneratedInviteUser(invitation.invited_profile_id ?? null);

  const { error } = await admin
    .from("invitations")
    .update({
      status: "expired",
      accepted_at: null,
      invited_profile_id: null
    })
    .eq("id", invitation.id);

  if (error) {
    return { success: false, error: "Failed to revoke invitation." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Invitation revoked." };
}
