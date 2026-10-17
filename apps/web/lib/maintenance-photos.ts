import type { MaintenancePhotoDTO } from "@/lib/maintenance";

export const MAX_MAINTENANCE_PHOTOS = 5;
export const MAX_MAINTENANCE_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_MAINTENANCE_PHOTO_PICK_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_MAINTENANCE_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export const PHOTO_UPLOAD_UNFINISHED_MESSAGE = "Maintenance request submitted, but the photo upload did not finish.";

export type MaintenancePhotoMimeType = (typeof ACCEPTED_MAINTENANCE_PHOTO_TYPES)[number];

interface MaintenancePhotoLike {
  name: string;
  type: string;
  size: number;
}

export function isAcceptedMaintenancePhotoType(type: string) {
  return ACCEPTED_MAINTENANCE_PHOTO_TYPES.includes(type as MaintenancePhotoMimeType);
}

export function validateMaintenancePhotoSelection(
  files: MaintenancePhotoLike[],
  existingCount = 0,
  maxBytes = MAX_MAINTENANCE_PHOTO_BYTES
): string | null {
  if (existingCount + files.length > MAX_MAINTENANCE_PHOTOS) {
    return `You can attach up to ${MAX_MAINTENANCE_PHOTOS} photos per ticket.`;
  }

  for (const file of files) {
    if (!isAcceptedMaintenancePhotoType(file.type)) {
      return "Photos must be JPEG, PNG, or WebP.";
    }

    if (file.size > maxBytes) {
      return maxBytes === MAX_MAINTENANCE_PHOTO_PICK_BYTES
        ? "Each photo must be under 50 MB." : "Each photo must be under 10MB.";
    }
  }

  return null;
}

export function buildMaintenancePhotoUrl(photoId: string) {
  return `/api/assets/maintenance-photo/${photoId}`;
}

export function sanitizeMaintenancePhotoFileName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "photo";
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function normalizeMaintenancePhotoRecord(record: {
  id: string;
  ticket_id: string;
  uploaded_by_profile_id: string;
  storage_path: string;
  created_at: string;
  caption?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
}): MaintenancePhotoDTO {
  const storageFileName = record.storage_path.split("/").pop() ?? "photo";

  return {
    id: record.id,
    ticketId: record.ticket_id,
    uploadedBy: record.uploaded_by_profile_id,
    fileName: record.file_name ?? storageFileName,
    fileType: record.file_type ?? "",
    fileSizeBytes: record.file_size_bytes ?? 0,
    createdAt: record.created_at,
    caption: record.caption ?? null,
    url: buildMaintenancePhotoUrl(record.id)
  };
}
