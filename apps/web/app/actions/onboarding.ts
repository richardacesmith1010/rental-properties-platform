"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import {
  findAccountByJoinCode,
  generateJoinCode,
  getOrCreateIndividualOwnershipAccount
} from "@/lib/ownership";
import {
  joinLlcByCodeSchema,
  parseFormData,
  setupLlcAccountSchema
} from "@/lib/validations";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

async function requireOwnerUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner") {
    redirect(getRoleHomePath(role));
  }

  return user;
}

async function getUniqueJoinCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateJoinCode();
    const existing = await findAccountByJoinCode(candidate);
    if (!existing) {
      return candidate;
    }
  }

  return null;
}

export async function setupIndividualAccount(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const user = await requireOwnerUser();

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
  const user = await requireOwnerUser();

  const capabilityError = await ensureCapabilityEnabled("ownershipEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(setupLlcAccountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const joinCode = await getUniqueJoinCode();
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
  const user = await requireOwnerUser();

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
