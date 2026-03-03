import { getSupabaseClient } from "./supabase";
import { isMissingSchemaError } from "./tenant-data";

interface UploadTicketPhotoInput {
  ticketId: string;
  userId: string;
  photoUri: string;
}

interface UploadTicketPhotoResult {
  success: boolean;
  error?: string;
  storagePath?: string;
}

function inferExtension(uri: string): string {
  const clean = uri.split("?")[0] ?? uri;
  const last = clean.split(".").pop()?.toLowerCase();
  if (!last || last.length > 5) {
    return "jpg";
  }
  return last;
}

function inferContentType(extension: string): string {
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "heic") {
    return "image/heic";
  }
  return "image/jpeg";
}

export async function uploadTicketPhoto(
  input: UploadTicketPhotoInput
): Promise<UploadTicketPhotoResult> {
  const supabase = getSupabaseClient();

  try {
    const extension = inferExtension(input.photoUri);
    const contentType = inferContentType(extension);
    const fileResponse = await fetch(input.photoUri);

    if (!fileResponse.ok) {
      return { success: false, error: "Unable to read selected photo." };
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const path = `${input.userId}/${input.ticketId}/${Date.now()}.${extension}`;

    const uploadResult = await supabase.storage
      .from("maintenance-photos")
      .upload(path, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadResult.error) {
      if (isMissingSchemaError(uploadResult.error)) {
        return { success: false, error: "Photo upload requires a database update." };
      }

      return { success: false, error: uploadResult.error.message };
    }

    const insertResult = await supabase.from("maintenance_photos").insert({
      ticket_id: input.ticketId,
      uploaded_by_profile_id: input.userId,
      storage_path: path,
      caption: null,
    });

    if (insertResult.error) {
      if (isMissingSchemaError(insertResult.error)) {
        return { success: false, error: "Photo upload requires a database update." };
      }

      return { success: false, error: insertResult.error.message };
    }

    return {
      success: true,
      storagePath: path,
    };
  } catch {
    return { success: false, error: "Unable to upload the selected photo." };
  }
}
