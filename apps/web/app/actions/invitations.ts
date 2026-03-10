"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { notifyOwnerMembersOfAcceptedTenantInvite } from "@/lib/notifications";
import {
  inviteTenantSchema,
  inviteManagerSchema,
  inviteOwnerSchema,
  resendInviteSchema,
  parseFormData
} from "@/lib/validations";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function inviteTenant(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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
        await admin.from("invitations").insert({
          email: email.toLowerCase(),
          full_name: fullName,
          role: "tenant",
          property_id: propertyId,
          invited_by: user.id,
          invited_profile_id: existingProfile.id,
          status: "accepted",
          accepted_at: new Date().toISOString()
        });

        void notifyOwnerMembersOfAcceptedTenantInvite(existingProfile.id).catch(() => {});
        void awardXp(
          user.id,
          "tenant_invited",
          XP_VALUES.tenant_invited,
          "Tenant linked to property.",
          { property_id: propertyId, tenant_profile_id: existingProfile.id }
        ).catch(() => {});
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

  void awardXp(
    user.id,
    "tenant_invited",
    XP_VALUES.tenant_invited,
    "Tenant invitation sent.",
    { property_id: propertyId, email: email.toLowerCase() }
  ).catch(() => {});

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function inviteManager(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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
  await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "manager",
    property_id: propertyId,
    invited_by: user.id,
    status: "pending",
  });

  // Pre-assign manager to property (inviteUserByEmail creates the auth user immediately)
  if (inviteData?.user?.id) {
    await admin.from("property_managers").upsert(
      {
        property_id: propertyId,
        manager_profile_id: inviteData.user.id,
        active: true,
      },
      { onConflict: "property_id,manager_profile_id" }
    );
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function inviteOwner(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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

  await admin.from("invitations").insert({
    email: email.toLowerCase(),
    full_name: fullName,
    role: "owner",
    invited_by: user.id,
    ownership_account_id: ownershipAccountId,
    status: "pending"
  });

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}


export async function resendInvite(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
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
  await admin
    .from("invitations")
    .update({ created_at: new Date().toISOString() })
    .eq("id", invitationId);

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Notifications ─── */
