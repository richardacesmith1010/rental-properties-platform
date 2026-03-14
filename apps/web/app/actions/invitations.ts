"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { sideEffectError } from "@/lib/logger";
import { notifyOwnerMembersOfAcceptedTenantInvite } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  inviteTenantSchema,
  inviteManagerSchema,
  inviteOwnerSchema,
  resendInviteSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

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

  const { email, fullName, propertyId } = parsed.data;
  const admin = createAdminClient();

  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  // Check if user already exists in profiles
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
    .single();

  if (existingProfile) {
    if (existingProfile.role === "tenant") {
      const { data: existingPropertyInvite } = await admin
        .from("invitations")
        .select("id, status")
        .eq("email", email.toLowerCase())
        .eq("role", "tenant")
        .eq("property_id", propertyId)
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      if (!existingPropertyInvite) {
        const { error: linkInviteError } = await admin.from("invitations").insert({
          email: email.toLowerCase(),
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
            tenantEmail: email.toLowerCase()
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
      error: "A user with this email already exists with a different role.",
    };
  }

  // Check for existing pending invitation
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id, status")
    .eq("email", email.toLowerCase())
    .eq("role", "tenant")
    .eq("property_id", propertyId)
    .single();

  if (existingInvite && existingInvite.status === "pending") {
    return {
      success: false,
      error: "An invitation has already been sent to this email.",
    };
  }

  // Send the invite via Supabase Admin API
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        role: "tenant",
        full_name: fullName,
        property_id: propertyId
      },
    }
  );

  if (inviteError) {
    return {
      success: false,
      error: "Failed to send invitation. Please try again.",
    };
  }

  // Track the invitation
  const { error: insertError } = await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "tenant",
    property_id: propertyId,
    invited_by: user.id,
    status: "pending",
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
      tenantEmail: email.toLowerCase()
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
    { property_id: propertyId, email: email.toLowerCase() }
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

export async function inviteManager(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");

  const inviteRate = checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000);
  if (!inviteRate.allowed) {
    return { success: false, error: "Too many invitations sent. Please try again later." };
  }

  const parsed = parseFormData(inviteManagerSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { email, fullName, propertyId } = parsed.data;
  const admin = createAdminClient();

  // Verify inviter can administer this property.
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .single();

  if (!property || !(await canUserAdministerProperty(user.id, property.id))) {
    return { success: false, error: "Property not found." };
  }

  // Check if user already exists
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
    .single();

  if (existingProfile) {
    if (existingProfile.role === "manager") {
      // Already a manager — just assign to property
      const { error: assignError } = await admin
        .from("property_managers")
        .upsert(
          {
            property_id: propertyId,
            manager_profile_id: existingProfile.id,
            active: true,
          },
          { onConflict: "property_id,manager_profile_id" }
        );

      if (assignError) {
        return { success: false, error: "Failed to assign manager to property." };
      }

      void logAudit({
        userId: user.id,
        action: "invite_manager",
        entityType: "invitation",
        metadata: {
          propertyId,
          tenantEmail: email.toLowerCase(),
          managerProfileId: existingProfile.id
        }
      }).catch(
        sideEffectError("inviteManager", "log_audit", {
          userId: user.id,
          entityType: "invitation",
          entityId: existingProfile.id
        })
      );

	      revalidatePath("/owner");
        revalidatePath("/manager");
	      return { success: true };
    }
    return {
      success: false,
      error: "A user with this email already exists with a different role.",
    };
  }

  // Send invite
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: "manager",
        full_name: fullName,
      },
    });

  if (inviteError) {
    return { success: false, error: "Failed to send invitation. Please try again." };
  }

  // Track invitation with property_id
  const { error: trackInviteError } = await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "manager",
    property_id: propertyId,
    invited_by: user.id,
    status: "pending",
  });

  if (trackInviteError) {
    console.error("Failed to track manager invitation:", trackInviteError);
  }

  // Pre-assign manager to property (inviteUserByEmail creates the auth user immediately)
  if (inviteData?.user?.id) {
    const { error: managerAssignmentError } = await admin.from("property_managers").upsert(
      {
        property_id: propertyId,
        manager_profile_id: inviteData.user.id,
        active: true,
      },
      { onConflict: "property_id,manager_profile_id" }
    );

    if (managerAssignmentError) {
      return { success: false, error: "Manager invited, but property assignment failed." };
    }
  }

  void logAudit({
    userId: user.id,
    action: "invite_manager",
    entityType: "invitation",
    metadata: {
      propertyId,
      tenantEmail: email.toLowerCase()
    }
  }).catch(
    sideEffectError("inviteManager", "log_audit", {
      userId: user.id,
      entityType: "invitation",
      entityId: propertyId
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
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

  if (!(await canUserAdministerOwnershipAccount(user.id, ownershipAccountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.toLowerCase())
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
        tenantEmail: email.toLowerCase(),
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
    .eq("email", email.toLowerCase())
    .eq("role", "owner")
    .eq("ownership_account_id", ownershipAccountId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite?.id) {
    return { success: false, error: "An owner invitation is already pending for this account." };
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
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
    email: email.toLowerCase(),
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
      tenantEmail: email.toLowerCase()
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

  // Fetch the invitation (owned by this user)
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, full_name, role, status, property_id, ownership_account_id")
    .eq("id", invitationId)
    .eq("invited_by", user.id)
    .single();

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (invitation.status === "accepted") {
    return { success: false, error: "This invitation has already been accepted." };
  }

  // Resend the invite
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    invitation.email,
    {
      data: {
        role: invitation.role,
        full_name: invitation.full_name,
        property_id: invitation.property_id,
        ownership_account_id: invitation.ownership_account_id
      },
    }
  );

  if (inviteError) {
    return { success: false, error: "Failed to resend invitation." };
  }

  // Update the invitation timestamp
  const { error: resendUpdateError } = await admin
    .from("invitations")
    .update({ created_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (resendUpdateError) {
    console.error("Failed to update invitation resend timestamp:", resendUpdateError);
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Notifications ─── */
