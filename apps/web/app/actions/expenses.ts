"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

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

export async function createExpense(
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
  if (role !== "owner") {
    redirect("/");
  }

  const parsed = parseFormData(createExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    propertyId,
    category,
    description,
    amountDollars,
    expenseDate,
    recurring,
    recurringFrequency,
    vendorId,
    receiptFileId
  } = parsed.data;

  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const admin = createAdminClient();
  let resolvedReceiptFileId = receiptFileId || null;
  const receiptFile = formData.get("receiptFile");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    const uploadResult = await uploadExpenseReceiptFile(admin, propertyId, user.id, receiptFile);
    if ("error" in uploadResult) {
      return { success: false, error: uploadResult.error };
    }
    resolvedReceiptFileId = uploadResult.receiptFileId;
  }

  const { error } = await admin.from("property_expenses").insert({
    property_id: propertyId,
    created_by_profile_id: user.id,
    category,
    description: description || null,
    amount_cents: Math.round(amountDollars * 100),
    expense_date: expenseDate,
    recurring,
    recurring_frequency: recurring ? recurringFrequency || null : null,
    vendor_id: vendorId || null,
    receipt_file_id: resolvedReceiptFileId
  });

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to create expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}

export async function updateExpense(
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
  if (role !== "owner") {
    redirect("/");
  }

  const parsed = parseFormData(updateExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const {
    expenseId,
    category,
    description,
    amountDollars,
    expenseDate,
    recurring,
    recurringFrequency,
    vendorId,
    receiptFileId
  } = parsed.data;

  const admin = createAdminClient();
  const { data: existingExpense, error: expenseLookupError } = await admin
    .from("property_expenses")
    .select("id, property_id, receipt_file_id")
    .eq("id", expenseId)
    .single();

  if (expenseLookupError && await isMissingSchemaError(expenseLookupError)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (!existingExpense) {
    return { success: false, error: "Expense not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, existingExpense.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  let resolvedReceiptFileId = receiptFileId || existingExpense.receipt_file_id || null;
  const receiptFile = formData.get("receiptFile");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    const uploadResult = await uploadExpenseReceiptFile(
      admin,
      existingExpense.property_id,
      user.id,
      receiptFile
    );
    if ("error" in uploadResult) {
      return { success: false, error: uploadResult.error };
    }
    resolvedReceiptFileId = uploadResult.receiptFileId;
  }

  const { error } = await admin
    .from("property_expenses")
    .update({
      category,
      description: description || null,
      amount_cents: Math.round(amountDollars * 100),
      expense_date: expenseDate,
      recurring,
      recurring_frequency: recurring ? recurringFrequency || null : null,
      vendor_id: vendorId || null,
      receipt_file_id: resolvedReceiptFileId
    })
    .eq("id", expenseId);

  if (error) {
    return { success: false, error: "Failed to update expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}

export async function deleteExpense(
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
  if (role !== "owner") {
    redirect("/");
  }

  const parsed = parseFormData(deleteExpenseSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { expenseId } = parsed.data;
  const admin = createAdminClient();
  const { data: expense, error: lookupError } = await admin
    .from("property_expenses")
    .select("id, property_id")
    .eq("id", expenseId)
    .single();

  if (lookupError && await isMissingSchemaError(lookupError)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (!expense) {
    return { success: false, error: "Expense not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, expense.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await admin
    .from("property_expenses")
    .delete()
    .eq("id", expenseId);

  if (error) {
    return { success: false, error: "Failed to delete expense." };
  }

  revalidatePath("/owner");
  return { success: true };
}
