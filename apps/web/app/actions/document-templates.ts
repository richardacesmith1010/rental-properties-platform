"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { getAdministeredOwnerAccountIds, canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { sideEffectError } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import {
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  deleteDocumentTemplateSchema,
  uploadPropertyFileSchema,
  deletePropertyFileSchema,
  updateFileVisibilitySchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

function rateLimitError(action: string, maxRequests = 30, windowMs = 60_000) {
  return (userId: string): ActionState | null => {
    const result = checkRateLimit(`${action}:${userId}`, maxRequests, windowMs);
    return result.allowed ? null : { success: false, error: "Too many requests. Please try again later." };
  };
}

export async function createDocumentTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  const limited = rateLimitError("createDocumentTemplate")(user.id);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(createDocumentTemplateSchema, formData);
  if (!parsed.success) return parsed;

  const capabilities = await getFeatureCapabilities();
  const { name, category, bodyMarkdown, ownerAccountId } = parsed.data;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
    const targetOwnerAccountId = ownerAccountId ?? ownerAccountIds[0];
    if (!targetOwnerAccountId) {
      return { success: false, error: "No ownership account is available. Create or link a property first." };
    }
    if (!ownerAccountIds.includes(targetOwnerAccountId)) {
      return { success: false, error: "You do not have access to that ownership account." };
    }

    error = (
      await supabase.from("document_templates").insert({
        owner_account_id: targetOwnerAccountId,
        owner_profile_id: user.id,
        name,
        category,
        body_markdown: bodyMarkdown
      })
    ).error;
  } else {
    error = (
      await supabase.from("document_templates").insert({
        owner_profile_id: user.id,
        name,
        category,
        body_markdown: bodyMarkdown
      })
    ).error;
  }

  if (error) return { success: false, error: "Failed to create document template." };
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateDocumentTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  const limited = rateLimitError("updateDocumentTemplate")(user.id);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(updateDocumentTemplateSchema, formData);
  if (!parsed.success) return parsed;

  const { templateId, name, category, bodyMarkdown } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .update({ name, category, body_markdown: bodyMarkdown })
    .eq("id", templateId);

  if (error) return { success: false, error: "Failed to update document template." };
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteDocumentTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  const limited = rateLimitError("deleteDocumentTemplate")(user.id);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(deleteDocumentTemplateSchema, formData);
  if (!parsed.success) return parsed;

  const { error } = await supabase.from("document_templates").delete().eq("id", parsed.data.templateId);
  if (error) return { success: false, error: "Failed to delete document template." };

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function uploadPropertyFile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const limited = rateLimitError("uploadPropertyFile", 20, 60_000)(user.id);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(uploadPropertyFileSchema, formData);
  if (!parsed.success) return parsed;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "Please select a valid file." };
  if (file.size > 20 * 1024 * 1024) return { success: false, error: "File must be under 20MB." };

  const { propertyId, category, visibility, description } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${propertyId}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const fileType = file.type.startsWith("image/") ? "image" : file.type.includes("pdf") ? "pdf" : "document";

  const { error: uploadError } = await admin.storage.from("property-files").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (uploadError) return { success: false, error: "Failed to upload file to storage." };

  const { error: insertError } = await admin.from("property_files").insert({
    property_id: propertyId,
    uploaded_by_profile_id: user.id,
    file_name: file.name,
    storage_path: storagePath,
    file_type: fileType,
    category,
    visibility,
    description: description || null
  });

  if (insertError && isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { success: false, error: "Document vault is not available yet. Apply the property_files migration and retry." };
  }
  if (insertError) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { success: false, error: "Failed to save file metadata." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function deletePropertyFile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const limited = rateLimitError("deletePropertyFile")(user.id);
  if (limited) return limited;

  const parsed = parseFormData(deletePropertyFileSchema, formData);
  if (!parsed.success) return parsed;

  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id, storage_path")
    .eq("id", parsed.data.fileId)
    .single();

  if (fileError && isMissingSchemaError(fileError)) {
    return { success: false, error: "Document vault is not available yet. Apply the property_files migration and retry." };
  }
  if (!propertyFile) return { success: false, error: "File not found." };
  if (!(await canUserAdministerProperty(user.id, propertyFile.property_id))) {
    return { success: false, error: "You do not have access to this file." };
  }

  await admin.storage.from("property-files").remove([propertyFile.storage_path]);
  const { error: deleteError } = await admin.from("property_files").delete().eq("id", parsed.data.fileId);
  if (deleteError) return { success: false, error: "Failed to delete file." };

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function updateFileVisibility(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const limited = rateLimitError("updateFileVisibility")(user.id);
  if (limited) return limited;

  const parsed = parseFormData(updateFileVisibilitySchema, formData);
  if (!parsed.success) return parsed;

  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id")
    .eq("id", parsed.data.fileId)
    .single();

  if (fileError && isMissingSchemaError(fileError)) {
    return { success: false, error: "Document vault is not available yet. Apply the property_files migration and retry." };
  }
  if (!propertyFile) return { success: false, error: "File not found." };
  if (!(await canUserAdministerProperty(user.id, propertyFile.property_id))) {
    return { success: false, error: "You do not have access to this file." };
  }

  const { error } = await admin.from("property_files").update({ visibility: parsed.data.visibility }).eq("id", parsed.data.fileId);
  if (error) return { success: false, error: "Failed to update file visibility." };

  void logAudit({
    userId: user.id,
    action: "update_file_visibility",
    entityType: "property_file",
    entityId: parsed.data.fileId,
    metadata: { propertyId: propertyFile.property_id, visibility: parsed.data.visibility }
  }).catch(sideEffectError("updateFileVisibility", "log_audit", { userId: user.id, entityType: "property_file", entityId: parsed.data.fileId }));

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}
