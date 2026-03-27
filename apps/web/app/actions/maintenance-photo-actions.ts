"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  deleteMaintenancePhotoSchema,
  parseFormData,
  uploadMaintenancePhotoSchema
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import {
  canAccessMaintenanceTicketForPhotos,
  getMaintenancePhotoFiles,
  uploadPhotosForTicket
} from "./maintenance-queries";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function uploadMaintenancePhoto(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`uploadMaintenancePhoto:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("photoWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(uploadMaintenancePhotoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const files = getMaintenancePhotoFiles(formData);
  if (files.length === 0) {
    return { success: false, error: "Please select at least one valid photo." };
  }

  const uploadResult = await uploadPhotosForTicket({
    ticketId: parsed.data.ticketId,
    userId: user.id,
    role,
    files,
    caption: parsed.data.caption ?? null
  });

  if (!uploadResult.success) {
    return { success: false, error: uploadResult.error };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return {
    success: true,
    message: `${uploadResult.uploadedCount} photo${uploadResult.uploadedCount === 1 ? "" : "s"} uploaded.`
  };
}

export async function deleteMaintenancePhoto(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`deleteMaintenancePhoto:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("photoWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(deleteMaintenancePhotoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { data: photo, error: photoError } = await admin
    .from("maintenance_photos")
    .select("id, ticket_id, uploaded_by_profile_id, storage_path")
    .eq("id", parsed.data.photoId)
    .single();

  if (photoError || !photo) {
    return { success: false, error: "Photo not found." };
  }

  const access = await canAccessMaintenanceTicketForPhotos({
    userId: user.id,
    role,
    ticketId: photo.ticket_id
  });

  if (!access.ticket) {
    return { success: false, error: access.error ?? "You do not have access to this photo." };
  }

  const canDelete =
    photo.uploaded_by_profile_id === user.id ||
    (role === "owner" && (await canUserAdministerProperty(user.id, access.ticket.property_id)));

  if (!canDelete) {
    return { success: false, error: "Only the uploader or property owner can delete this photo." };
  }

  const { error: storageError } = await admin.storage.from("maintenance-photos").remove([photo.storage_path]);

  if (storageError) {
    return { success: false, error: "Failed to remove the photo from storage." };
  }

  const { error: deleteError } = await admin
    .from("maintenance_photos")
    .delete()
    .eq("id", parsed.data.photoId);

  if (deleteError) {
    return { success: false, error: "Failed to delete the photo record." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true, message: "Photo deleted." };
}
