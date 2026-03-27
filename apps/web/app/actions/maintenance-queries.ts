import { createAdminClient } from "@/lib/supabase/admin";
import {
  sanitizeMaintenancePhotoFileName,
  validateMaintenancePhotoSelection
} from "@/lib/maintenance-photos";
import { canUserAdministerProperty } from "@/lib/property-access";
import { isMissingSchemaError } from "./shared";

export function getMaintenancePhotoFiles(formData: FormData) {
  return formData
    .getAll("photos")
    .concat(formData.get("photo") ?? [])
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function canAccessMaintenanceTicketForPhotos(params: {
  userId: string;
  role: "owner" | "manager" | "tenant";
  ticketId: string;
}) {
  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("maintenance_tickets")
    .select("id, property_id, tenant_profile_id")
    .eq("id", params.ticketId)
    .single();

  if (error || !ticket) {
    return { ticket: null, error: "Ticket not found." };
  }

  if (params.role === "tenant") {
    if (ticket.tenant_profile_id !== params.userId) {
      return { ticket: null, error: "You do not have access to this ticket." };
    }
  } else {
    const canAdminister = await canUserAdministerProperty(params.userId, ticket.property_id);
    if (!canAdminister) {
      return { ticket: null, error: "You do not have access to this ticket." };
    }
  }

  return { ticket, error: null };
}

export async function rollbackUploadedMaintenancePhotos(params: {
  storagePaths: string[];
  photoIds: string[];
}) {
  const admin = createAdminClient();

  if (params.storagePaths.length > 0) {
    await admin.storage.from("maintenance-photos").remove(params.storagePaths);
  }

  if (params.photoIds.length > 0) {
    await admin.from("maintenance_photos").delete().in("id", params.photoIds);
  }
}

export async function insertMaintenancePhotoMetadata(params: {
  ticketId: string;
  uploadedByProfileId: string;
  storagePath: string;
  caption?: string | null;
  file: File;
}) {
  const admin = createAdminClient();
  const extendedPayload = {
    ticket_id: params.ticketId,
    uploaded_by_profile_id: params.uploadedByProfileId,
    storage_path: params.storagePath,
    caption: params.caption ?? null,
    file_name: params.file.name,
    file_type: params.file.type || "application/octet-stream",
    file_size_bytes: params.file.size
  };

  let insertResult = await admin
    .from("maintenance_photos")
    .insert(extendedPayload)
    .select("id")
    .single();

  if (insertResult.error && isMissingSchemaError(insertResult.error)) {
    insertResult = await admin
      .from("maintenance_photos")
      .insert({
        ticket_id: params.ticketId,
        uploaded_by_profile_id: params.uploadedByProfileId,
        storage_path: params.storagePath,
        caption: params.caption ?? null
      })
      .select("id")
      .single();
  }

  return insertResult;
}

export async function uploadPhotosForTicket(params: {
  ticketId: string;
  userId: string;
  role: "owner" | "manager" | "tenant";
  files: File[];
  caption?: string | null;
}) {
  if (params.files.length === 0) {
    return { success: true as const, uploadedCount: 0 };
  }

  const access = await canAccessMaintenanceTicketForPhotos({
    userId: params.userId,
    role: params.role,
    ticketId: params.ticketId
  });

  if (!access.ticket) {
    return { success: false as const, error: access.error ?? "Ticket not found." };
  }

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("maintenance_photos")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", params.ticketId);

  if (countError) {
    return { success: false as const, error: "Unable to verify the existing photo count." };
  }

  const validationError = validateMaintenancePhotoSelection(params.files, count ?? 0);
  if (validationError) {
    return { success: false as const, error: validationError };
  }

  const uploadedStoragePaths: string[] = [];
  const insertedPhotoIds: string[] = [];

  for (const file of params.files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeName = sanitizeMaintenancePhotoFileName(file.name.replace(/\.[^.]+$/, ""));
    const storagePath = `${params.ticketId}/${crypto.randomUUID()}-${safeName}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("maintenance-photos")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      await rollbackUploadedMaintenancePhotos({
        storagePaths: uploadedStoragePaths,
        photoIds: insertedPhotoIds
      });
      return { success: false as const, error: "Failed to upload one or more photos." };
    }

    uploadedStoragePaths.push(storagePath);

    const insertResult = await insertMaintenancePhotoMetadata({
      ticketId: params.ticketId,
      uploadedByProfileId: params.userId,
      storagePath,
      caption: params.caption ?? null,
      file
    });

    if (insertResult.error || !insertResult.data?.id) {
      await rollbackUploadedMaintenancePhotos({
        storagePaths: uploadedStoragePaths,
        photoIds: insertedPhotoIds
      });
      return { success: false as const, error: "Photo uploaded but metadata save failed." };
    }

    insertedPhotoIds.push(insertResult.data.id);
  }

  return { success: true as const, uploadedCount: insertedPhotoIds.length };
}
