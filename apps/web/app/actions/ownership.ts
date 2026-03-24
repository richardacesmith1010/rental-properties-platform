"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { canUserAdministerOwnershipAccount, getUniqueOwnershipJoinCode } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  addOwnershipMemberSchema,
  linkPropertyToOwnershipAccountSchema,
  createOwnershipAccountSchema,
  parseFormData
} from "@/lib/validations";
import { removeOwnershipMemberSchema } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function createOwnershipAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`createOwnershipAccount:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createOwnershipAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { accountType, displayName } = parsed.data;
  const joinCode = accountType === "llc" ? await getUniqueOwnershipJoinCode() : null;
  if (accountType === "llc" && !joinCode) {
    return { success: false, error: "Failed to generate a unique join code. Please try again." };
  }
  const { data: account, error } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: accountType,
      display_name: displayName,
      created_by_profile_id: user.id,
      join_code: joinCode
    })
    .select("id")
    .single();

  if (error || !account?.id) {
    return { success: false, error: "Failed to create ownership account." };
  }

  const { error: memberError } = await admin.from("ownership_account_members").insert({
    account_id: account.id,
    profile_id: user.id,
    member_role: "owner",
    active: true,
    can_receive_critical_alerts: true
  });

  if (memberError) {
    return { success: false, error: "Account created, but failed to add owner membership." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function removeOwnershipMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const rateLimited = checkRateLimit(`removeOwnershipMember:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(removeOwnershipMemberSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { accountId, profileId } = parsed.data;
  if (profileId === user.id) {
    return { success: false, error: "You cannot remove yourself from this LLC." };
  }

  if (!(await canUserAdministerOwnershipAccount(user.id, accountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("ownership_account_members")
    .select("account_id, profile_id, active")
    .eq("account_id", accountId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (membershipError) {
    return { success: false, error: "Unable to load that LLC member right now." };
  }

  if (!membership) {
    return { success: false, error: "Member not found." };
  }

  if (!membership.active) {
    return { success: false, error: "This member has already been removed." };
  }

  const { error } = await admin
    .from("ownership_account_members")
    .update({ active: false })
    .eq("account_id", accountId)
    .eq("profile_id", profileId);

  if (error) {
    return { success: false, error: "Failed to remove this LLC member." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "LLC member removed." };
}

export async function addOwnershipMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`addOwnershipMember:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(addOwnershipMemberSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { accountId, profileId, canReceiveCriticalAlerts } = parsed.data;

  if (!(await canUserAdministerOwnershipAccount(user.id, accountId))) {
    return { success: false, error: "You do not have access to that ownership account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ownership_account_members").upsert(
    {
      account_id: accountId,
      profile_id: profileId,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: canReceiveCriticalAlerts ?? true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (error) {
    return { success: false, error: "Failed to add ownership member." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function linkPropertyToOwnershipAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireAuth("owner", "manager");
  const rateLimited = checkRateLimit(`linkPropertyToOwnershipAccount:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(linkPropertyToOwnershipAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, ownershipAccountId } = parsed.data;
  const [propertyPermissionResult, accountPermissionResult] = await Promise.allSettled([
    canUserAdministerProperty(user.id, propertyId),
    canUserAdministerOwnershipAccount(user.id, ownershipAccountId)
  ]);

  if (
    propertyPermissionResult.status === "rejected" ||
    accountPermissionResult.status === "rejected"
  ) {
    if (propertyPermissionResult.status === "rejected") {
      console.error("linkPropertyToOwnershipAccount property permission error:", propertyPermissionResult.reason);
    }
    if (accountPermissionResult.status === "rejected") {
      console.error("linkPropertyToOwnershipAccount account permission error:", accountPermissionResult.reason);
    }
    return {
      success: false,
      error: "Unable to validate property and ownership account access right now."
    };
  }

  const canAdministerProperty = propertyPermissionResult.value;
  const canAdministerAccount = accountPermissionResult.value;

  if (!canAdministerProperty) {
    return { success: false, error: "You do not have access to this property." };
  }
  if (!canAdministerAccount) {
    return { success: false, error: "You do not have access to this ownership account." };
  }

  const { error } = await supabase
    .from("properties")
    .update({ owner_account_id: ownershipAccountId })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to link property to ownership account." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
