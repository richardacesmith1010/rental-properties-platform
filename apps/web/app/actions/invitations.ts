"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  inviteManagerSchema,
  inviteOwnerSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

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
  const normalizedEmail = email.toLowerCase();

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .single();

  if (!property || !(await canUserAdministerProperty(user.id, property.id))) {
    return { success: false, error: "Property not found." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", normalizedEmail)
    .single();

  if (existingProfile) {
    if (existingProfile.role === "manager") {
      const { error: assignError } = await admin.from("property_managers").upsert(
        {
          property_id: propertyId,
          manager_profile_id: existingProfile.id,
          active: true
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
          tenantEmail: normalizedEmail,
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
      error: "A user with this email already exists with a different role."
    };
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      role: "manager",
      full_name: fullName
    }
  });

  if (inviteError) {
    return { success: false, error: "Failed to send invitation. Please try again." };
  }

  const { error: trackInviteError } = await admin.from("invitations").insert({
    email: normalizedEmail,
    full_name: fullName,
    role: "manager",
    property_id: propertyId,
    invited_by: user.id,
    status: "pending"
  });

  if (trackInviteError) {
    console.error("Failed to track manager invitation:", trackInviteError);
  }

  if (inviteData?.user?.id) {
    const { error: managerAssignmentError } = await admin.from("property_managers").upsert(
      {
        property_id: propertyId,
        manager_profile_id: inviteData.user.id,
        active: true
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
      tenantEmail: normalizedEmail
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
  const normalizedEmail = email.toLowerCase();

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
