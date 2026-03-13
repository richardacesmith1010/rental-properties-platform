"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { getVendorAssignmentPlan } from "@/lib/idempotency";
import {
  canUserAdministerProperty,
  getAdministeredOwnerAccountIds
} from "@/lib/property-access";
import {
  createVendorSchema,
  updateVendorSchema,
  assignVendorSchema,
  uploadMaintenancePhotoSchema,
  parseFormData
} from "@/lib/validations";
import {
  ensureCapabilityEnabled,
  isMissingSchemaError,
  type ActionState
} from "./shared";
import { logAudit } from "@/lib/audit";

export async function createVendor(
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(createVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, email, phone, tradeCategory, preferred, ownerAccountId } = parsed.data;
  let createdVendorId: string | null = null;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
    const targetOwnerAccountId = ownerAccountId ?? ownerAccountIds[0];
    if (!targetOwnerAccountId) {
      return {
        success: false,
        error: "No ownership account is available. Link or create a property first."
      };
    }

    if (!ownerAccountIds.includes(targetOwnerAccountId)) {
      return { success: false, error: "You do not have access to that ownership account." };
    }

    const insertResult = await supabase.from("vendors").insert({
      owner_profile_id: user.id,
      owner_account_id: targetOwnerAccountId,
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred,
      active: true
    }).select("id").single();
    createdVendorId = insertResult.data?.id ?? null;
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("vendors").insert({
      owner_profile_id: user.id,
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred,
      active: true
    }).select("id").single();
    createdVendorId = insertResult.data?.id ?? null;
    error = insertResult.error;
  }

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Preferred-vendor fields are not available yet. Apply the latest vendor migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to create vendor." };
  }

  void logAudit({
    userId: user.id,
    action: "create_vendor",
    entityType: "vendor",
    entityId: createdVendorId ?? undefined,
    metadata: {
      vendorName: name,
      tradeCategory
    }
  }).catch(() => {});

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateVendor(
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(updateVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { vendorId, name, email, phone, tradeCategory, preferred } = parsed.data;
  const admin = createAdminClient();

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, owner_account_id")
    .eq("id", vendorId)
    .single();

  if (!vendor) {
    return { success: false, error: "Vendor not found." };
  }

  const ownerAccountIds = await getAdministeredOwnerAccountIds(user.id);
  if (vendor.owner_account_id && !ownerAccountIds.includes(vendor.owner_account_id)) {
    return { success: false, error: "You do not have access to this vendor." };
  }

  const { error } = await admin
    .from("vendors")
    .update({
      name,
      email: email || null,
      phone: phone || null,
      trade: tradeCategory,
      trade_category: tradeCategory,
      preferred
    })
    .eq("id", vendorId);

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Preferred-vendor fields are not available yet. Apply the latest vendor migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to update vendor." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function assignVendorToTicket(
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

  const capabilityError = await ensureCapabilityEnabled("vendorWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(assignVendorSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { ticketId, vendorId } = parsed.data;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("maintenance_tickets")
    .select("id, property_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, owner_account_id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const { data: vendor } = await admin
    .from("vendors")
    .select("id, owner_account_id")
    .eq("id", vendorId)
    .single();

  if (!vendor || vendor.owner_account_id !== property.owner_account_id) {
    return { success: false, error: "Vendor is not valid for this property owner." };
  }

  const { data: latestAssignment } = await admin
    .from("maintenance_assignments")
    .select("vendor_id")
    .eq("ticket_id", ticketId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const assignmentPlan = getVendorAssignmentPlan(
    latestAssignment?.vendor_id ?? null,
    vendorId
  );

  if (!assignmentPlan.shouldInsert) {
    return { success: true };
  }

  const { error } = await admin.from("maintenance_assignments").insert({
    ticket_id: ticketId,
    vendor_id: vendorId,
    assigned_by_profile_id: user.id,
    status: assignmentPlan.status
  });

  if (error) {
    return { success: false, error: "Failed to assign vendor." };
  }

  void logAudit({
    userId: user.id,
    action: "assign_vendor",
    entityType: "maintenance_ticket",
    entityId: ticketId,
    metadata: {
      propertyId: property.id,
      vendorId,
      ticketId
    }
  }).catch(() => {});

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function uploadMaintenancePhoto(
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

  const capabilityError = await ensureCapabilityEnabled("photoWorkflowEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(uploadMaintenancePhotoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Please select a valid photo file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Photo must be under 10MB." };
  }

  const { ticketId, caption } = parsed.data;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("maintenance_tickets")
    .select("id, property_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { success: false, error: "Ticket not found." };
  }

  const { data: property } = await admin
    .from("properties")
    .select("id")
    .eq("id", ticket.property_id)
    .single();

  if (!property) {
    return { success: false, error: "Property not found for ticket." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, property.id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this ticket." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${ticketId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("maintenance-photos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

  if (uploadError) {
    return { success: false, error: "Failed to upload photo." };
  }

  const { error: insertError } = await admin.from("maintenance_photos").insert({
    ticket_id: ticketId,
    uploaded_by_profile_id: user.id,
    storage_path: path,
    caption: caption || null
  });

  if (insertError) {
    return { success: false, error: "Photo uploaded but metadata save failed." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

/* ─── Expenses + P&L ─── */

async function uploadExpenseReceiptFile(
  admin: ReturnType<typeof createAdminClient>,
  propertyId: string,
  userId: string,
  file: File
): Promise<{ receiptFileId: string } | { error: string }> {
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Receipt file must be under 20MB." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${propertyId}/receipts/${crypto.randomUUID()}.${extension}`;
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
    return { error: "Failed to upload receipt file." };
  }

  const { data: propertyFile, error: insertError } = await admin
    .from("property_files")
    .insert({
      property_id: propertyId,
      uploaded_by_profile_id: userId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: fileType,
      category: "receipt",
      visibility: "owner_manager",
      description: "Expense receipt upload"
    })
    .select("id")
    .single();

  if (insertError && await isMissingSchemaError(insertError)) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt upload requires the property file vault migration." };
  }

  if (insertError || !propertyFile) {
    await admin.storage.from("property-files").remove([storagePath]);
    return { error: "Receipt uploaded, but metadata save failed." };
  }

  return { receiptFileId: propertyFile.id };
}
