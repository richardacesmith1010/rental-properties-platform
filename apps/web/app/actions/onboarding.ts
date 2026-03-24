"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  findAccountByJoinCode,
  getUniqueOwnershipJoinCode,
  getOrCreateIndividualOwnershipAccount
} from "@/lib/ownership";
import {
  joinLlcByCodeSchema,
  parseFormData,
  setupLlcAccountSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function setupIndividualAccount(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const rateLimited = checkRateLimit(`setupIndividualAccount:${user.id}`, 10, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  try {
    await getOrCreateIndividualOwnershipAccount(user.id);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to set up your individual account."
    };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/setup");
  return { success: true };
}

export async function setupLlcAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const rateLimited = checkRateLimit(`setupLlcAccount:${user.id}`, 10, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(setupLlcAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const joinCode = await getUniqueOwnershipJoinCode();
  if (!joinCode) {
    return { success: false, error: "Failed to generate a unique join code. Please try again." };
  }

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("ownership_accounts")
    .insert({
      account_type: "llc",
      display_name: parsed.data.displayName,
      created_by_profile_id: user.id,
      join_code: joinCode
    })
    .select("id")
    .single();

  if (accountError || !account?.id) {
    return { success: false, error: "Failed to create LLC account." };
  }

  const { error: memberError } = await admin.from("ownership_account_members").upsert(
    {
      account_id: account.id,
      profile_id: user.id,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (memberError) {
    return { success: false, error: "LLC created, but failed to attach your ownership membership." };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/setup");
  return {
    success: true,
    joinCode,
    accountId: account.id
  };
}

export async function joinLlcByCode(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const rateLimited = checkRateLimit(`joinLlcByCode:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(joinLlcByCodeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const normalizedJoinCode = parsed.data.joinCode.toUpperCase();
  const account = await findAccountByJoinCode(normalizedJoinCode);
  if (!account) {
    return {
      success: false,
      error: "Invalid join code. Please check and try again."
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("ownership_account_members").upsert(
    {
      account_id: account.id,
      profile_id: user.id,
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    },
    { onConflict: "account_id,profile_id" }
  );

  if (error) {
    return { success: false, error: "Failed to join this LLC account." };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/setup");
  return { success: true };
}
