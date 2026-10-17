import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { resolveUploadType } from "@/lib/file-signature";

export async function uploadExpenseReceiptFile(
  admin: ReturnType<typeof createAdminClient>,
  propertyId: string,
  userId: string,
  file: File
): Promise<{ receiptFileId: string } | { error: string }> {
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Receipt file must be under 20MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const resolved = resolveUploadType("receipt", bytes, file.name);
  if (!resolved) return { error: "Receipt must be a photo or a PDF." };
  const storagePath = `${propertyId}/receipts/${crypto.randomUUID()}.${resolved.extension}`;
  const uploadFile = new File([bytes], file.name, { type: resolved.contentType });

  const { error: uploadError } = await admin.storage.from("property-files").upload(storagePath, uploadFile, {
    contentType: resolved.contentType,
    upsert: false
  });

  if (uploadError) {
    return { error: "Failed to upload receipt file." };
  }

  const { data: propertyFile, error: insertError } = await admin
    .from("property_files")
    .insert({
      property_id: propertyId,
      uploaded_by_profile_id: userId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: resolved.category,
      category: "receipt",
      visibility: "owner_manager",
      description: "Expense receipt upload"
    })
    .select("id")
    .single();

  if (insertError && isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt upload requires the property file vault migration." };
  }

  if (insertError || !propertyFile) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt uploaded, but metadata save failed." };
  }

  return { receiptFileId: propertyFile.id };
}
