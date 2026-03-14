"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleHomePath } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  completeOnboardingSchema,
  updateProfileSchema,
  uploadAvatarSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const AVATAR_BUCKET = "profile-avatars";

function getAvatarExtension(file: File) {
  if (file.type === "image/jpeg") {
    return "jpg";
  }
  if (file.type === "image/png") {
    return "png";
  }
  if (file.type === "image/webp") {
    return "webp";
  }

  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension === "jpg" || nameExtension === "jpeg") {
    return "jpg";
  }
  if (nameExtension === "png" || nameExtension === "webp") {
    return nameExtension;
  }

  return null;
}

function buildFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

async function storeAvatar(userId: string, file: File) {
  const extension = getAvatarExtension(file);
  if (!extension) {
    return {
      success: false as const,
      error: "Profile photo must be a JPG, PNG, or WebP image."
    };
  }

  const admin = createAdminClient();
  const storageKey = `${userId}/avatar.${extension}`;
  const storagePath = `${AVATAR_BUCKET}/${storageKey}`;
  const { error: uploadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(storageKey, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) {
    return { success: false as const, error: "Failed to upload profile photo." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ avatar_url: storagePath })
    .eq("id", userId);

  if (profileError) {
    return { success: false as const, error: "Photo uploaded, but failed to save it to your profile." };
  }

  const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(storageKey);
  return {
    success: true as const,
    storagePath,
    publicUrl: data.publicUrl
  };
}

async function applyProfileUpdate(params: {
  userId: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  avatarFile?: File;
  markOnboardingComplete: boolean;
}) {
  const admin = createAdminClient();
  let avatarResult:
    | {
        success: true;
        storagePath: string;
        publicUrl: string;
      }
    | {
        success: false;
        error: string;
      }
    | null = null;

  if (params.avatarFile) {
    avatarResult = await storeAvatar(params.userId, params.avatarFile);
    if (!avatarResult.success) {
      return { success: false as const, error: avatarResult.error };
    }
  }

  const fullName = buildFullName(params.firstName, params.lastName);
  const resolvedNickname = params.nickname?.trim() || params.firstName.trim();
  const updatePayload: {
    full_name: string;
    nickname: string;
    onboarding_completed_at?: string;
  } = {
    full_name: fullName,
    nickname: resolvedNickname
  };

  if (params.markOnboardingComplete) {
    updatePayload.onboarding_completed_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", params.userId);

  if (error) {
    return { success: false as const, error: "Failed to save your profile." };
  }

  return {
    success: true as const,
    avatarUrl: avatarResult?.publicUrl
  };
}

export async function completeOnboarding(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  const rateLimited = checkRateLimit(`completeOnboarding:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(completeOnboardingSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const result = await applyProfileUpdate({
    userId: user.id,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    nickname: parsed.data.nickname,
    avatarFile: parsed.data.avatarFile,
    markOnboardingComplete: true
  });

  if (!result.success) {
    return result;
  }

  revalidatePath("/onboarding");
  revalidatePath("/settings");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  redirect(getRoleHomePath(role));
}

export async function updateProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  const rateLimited = checkRateLimit(`updateProfile:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateProfileSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const result = await applyProfileUpdate({
    userId: user.id,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    nickname: parsed.data.nickname,
    avatarFile: parsed.data.avatarFile,
    markOnboardingComplete: false
  });

  if (!result.success) {
    return result;
  }

  revalidatePath("/settings");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return {
    success: true,
    message: "Profile updated successfully.",
    avatarUrl: result.avatarUrl
  };
}

export async function uploadAvatar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  const rateLimited = checkRateLimit(`uploadAvatar:${user.id}`, 20, 60_000);
  if (!rateLimited.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(uploadAvatarSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const avatarFile = parsed.data.avatarFile;
  if (!avatarFile) {
    return { success: false, error: "Profile photo is required." };
  }

  const result = await storeAvatar(user.id, avatarFile);
  if (!result.success) {
    return result;
  }

  revalidatePath("/settings");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return {
    success: true,
    message: "Profile photo updated successfully.",
    avatarUrl: result.publicUrl
  };
}
