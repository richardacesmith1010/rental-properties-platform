"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { shouldThrottleDocumentPacketSend } from "@/lib/idempotency";
import {
  canUserAdministerProperty,
  getAdministeredOwnerAccountIds
} from "@/lib/property-access";
import {
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  deleteDocumentTemplateSchema,
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  uploadPropertyFileSchema,
  deletePropertyFileSchema,
  updateFileVisibilitySchema,
  parseFormData
} from "@/lib/validations";
import { ensureCapabilityEnabled, isMissingSchemaError, type ActionState } from "./shared";

export async function createDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, category, bodyMarkdown, ownerAccountId } = parsed.data;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
    const targetOwnerAccountId = ownerAccountId ?? ownerAccountIds[0];

    if (!targetOwnerAccountId) {
      return {
        success: false,
        error: "No ownership account is available. Create or link a property first."
      };
    }

    if (!ownerAccountIds.includes(targetOwnerAccountId)) {
      return { success: false, error: "You do not have access to that ownership account." };
    }

    const insertResult = await supabase.from("document_templates").insert({
      owner_account_id: targetOwnerAccountId,
      owner_profile_id: user.id,
      name,
      category,
      body_markdown: bodyMarkdown
    });
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("document_templates").insert({
      owner_profile_id: user.id,
      name,
      category,
      body_markdown: bodyMarkdown
    });
    error = insertResult.error;
  }

  if (error) {
    return { success: false, error: "Failed to create document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(updateDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId, name, category, bodyMarkdown } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .update({
      name,
      category,
      body_markdown: bodyMarkdown
    })
    .eq("id", templateId);

  if (error) {
    return { success: false, error: "Failed to update document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteDocumentTemplate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(deleteDocumentTemplateSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId } = parsed.data;
  const { error } = await supabase
    .from("document_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    return { success: false, error: "Failed to delete document template." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function createDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { templateId, leaseId } = parsed.data;

  const [{ data: template }, { data: lease }] = await Promise.all([
    supabase
      .from("document_templates")
      .select("id, owner_account_id")
      .eq("id", templateId)
      .single(),
    supabase
      .from("leases")
      .select("id, unit_id")
      .eq("id", leaseId)
      .single()
  ]);

  if (!template) {
    return { success: false, error: "Template not found." };
  }
  if (!lease) {
    return { success: false, error: "Lease not found." };
  }

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found for lease." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", unit.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for lease." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this lease." };
  }

  if (template.owner_account_id !== property.owner_account_id) {
    return { success: false, error: "Template account does not match this property account." };
  }

  const { error } = await supabase.from("document_packets").insert({
    template_id: templateId,
    property_id: property.id,
    unit_id: unit.id,
    lease_id: lease.id,
    status: "draft",
    created_by_profile_id: user.id
  });

  if (error) {
    return { success: false, error: "Failed to create document packet." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function sendDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(sendDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { packetId } = parsed.data;
  const admin = createAdminClient();

  const { data: packet } = await supabase
    .from("document_packets")
    .select("id, lease_id, property_id, status, sent_at")
    .eq("id", packetId)
    .single();

  if (!packet) {
    return { success: false, error: "Document packet not found." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", packet.property_id)
    .single();

  if (!property || !(await canUserAdministerProperty(user.id, property.id))) {
    return { success: false, error: "You do not have access to this packet." };
  }

  if (packet.status === "signed" || packet.status === "void") {
    return { success: false, error: "This packet can no longer be sent." };
  }

  if (packet.status === "sent" && shouldThrottleDocumentPacketSend(packet.sent_at)) {
    return { success: true };
  }

  if (!packet.lease_id) {
    return { success: false, error: "Packet must be linked to a lease before sending." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, tenant_profile_id")
    .eq("id", packet.lease_id)
    .single();

  if (!lease?.tenant_profile_id) {
    return { success: false, error: "No tenant linked to this lease." };
  }

  const { data: tenantProfile } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", lease.tenant_profile_id)
    .single();

  if (!tenantProfile?.email) {
    return { success: false, error: "Tenant email is missing for this lease." };
  }

  const { error: signerError } = await admin.from("document_signers").upsert(
    {
      packet_id: packet.id,
      profile_id: tenantProfile.id,
      email: tenantProfile.email,
      role: "tenant",
      status: "pending"
    },
    { onConflict: "packet_id,email" }
  );

  if (signerError) {
    return { success: false, error: "Failed to set packet signer." };
  }

  const { error: packetError } = await supabase
    .from("document_packets")
    .update({
      status: "sent",
      sent_at: new Date().toISOString()
    })
    .eq("id", packet.id);

  if (packetError) {
    return { success: false, error: "Failed to send packet." };
  }

  await createNotificationWithDelivery({
    recipientProfileId: tenantProfile.id,
    recipientEmail: tenantProfile.email,
    type: "document_sent",
    title: "New document awaiting signature",
    body: "A lease-related document has been sent to you for signature.",
    entityType: "document_packet",
    entityId: packet.id
  });
  await notifyOwnerMembersForProperty({
    propertyId: packet.property_id,
    type: "document_sent",
    title: "Document packet sent",
    body: "A document packet was sent to the tenant for signature.",
    entityType: "document_packet",
    entityId: packet.id,
    excludeProfileId: user.id
  });

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function signDocumentPacket(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(signDocumentPacketSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { packetId, signatureText } = parsed.data;
  const admin = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const email = profile?.email ?? "";
  const requestHeaders = headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;
  const userAgent = requestHeaders.get("user-agent");

  const [{ data: signerByProfile }, { data: signerByEmail }] = await Promise.all([
    admin
      .from("document_signers")
      .select("id, status")
      .eq("packet_id", packetId)
      .eq("profile_id", user.id)
      .maybeSingle(),
    email
      ? admin
          .from("document_signers")
          .select("id, status")
          .eq("packet_id", packetId)
          .eq("email", email)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const signer = signerByProfile ?? signerByEmail;

  if (!signer) {
    return { success: false, error: "Signer record not found for this document." };
  }

  if (signer.status === "signed") {
    return { success: false, error: "This document is already signed." };
  }

  const signedAt = new Date().toISOString();
  const { error: signerError } = await admin
    .from("document_signers")
    .update({
      profile_id: user.id,
      status: "signed",
      signature_text: signatureText,
      signed_at: signedAt,
      ip_address: ipAddress,
      user_agent: userAgent
    })
    .eq("id", signer.id);

  if (signerError) {
    return { success: false, error: "Failed to sign document." };
  }

  const { data: remaining } = await admin
    .from("document_signers")
    .select("id")
    .eq("packet_id", packetId)
    .eq("status", "pending")
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await admin
      .from("document_packets")
      .update({ status: "signed", signed_at: signedAt })
      .eq("id", packetId);

    const { data: packet } = await admin
      .from("document_packets")
      .select("id, property_id")
      .eq("id", packetId)
      .single();

    if (packet?.property_id) {
      await notifyOwnerMembersForProperty({
        propertyId: packet.property_id,
        type: "document_signed",
        title: "Document packet signed",
        body: "A tenant completed a required document signature.",
        entityType: "document_packet",
        entityId: packet.id
      });
    }
  }

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function uploadPropertyFile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(uploadPropertyFileSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Please select a valid file." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { success: false, error: "File must be under 20MB." };
  }

  const { propertyId, category, visibility, description } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${propertyId}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const fileType = file.type.startsWith("image/")
    ? "image"
    : file.type.includes("pdf")
      ? "pdf"
      : "document";

  const { error: uploadError } = await admin.storage
    .from("property-files")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    return { success: false, error: "Failed to upload file to storage." };
  }

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

  if (insertError && await isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
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

export async function deletePropertyFile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(deletePropertyFileSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { fileId } = parsed.data;
  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id, storage_path")
    .eq("id", fileId)
    .single();

  if (fileError && await isMissingSchemaError(fileError)) {
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
  }

  if (!propertyFile) {
    return { success: false, error: "File not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, propertyFile.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this file." };
  }

  await admin.storage.from("property-files").remove([propertyFile.storage_path]);

  const { error: deleteError } = await admin
    .from("property_files")
    .delete()
    .eq("id", fileId);

  if (deleteError) {
    return { success: false, error: "Failed to delete file." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function updateFileVisibility(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  const parsed = parseFormData(updateFileVisibilitySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { fileId, visibility } = parsed.data;
  const admin = createAdminClient();
  const { data: propertyFile, error: fileError } = await admin
    .from("property_files")
    .select("id, property_id")
    .eq("id", fileId)
    .single();

  if (fileError && await isMissingSchemaError(fileError)) {
    return {
      success: false,
      error: "Document vault is not available yet. Apply the property_files migration and retry."
    };
  }

  if (!propertyFile) {
    return { success: false, error: "File not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, propertyFile.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this file." };
  }

  const { error } = await admin
    .from("property_files")
    .update({ visibility })
    .eq("id", fileId);

  if (error) {
    return { success: false, error: "Failed to update file visibility." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}
