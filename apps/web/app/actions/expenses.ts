"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { uploadExpenseReceiptFile } from "@/lib/uploads";
import {
  createExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export async function createExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`createExpense:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  const { data: createdExpense, error } = await admin
    .from("property_expenses")
    .insert({
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
    })
    .select("id")
    .single();

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Expense tracking is not available yet. Apply the Phase 4 migration and retry."
    };
  }

  if (error) {
    return { success: false, error: "Failed to create expense." };
  }

  void logAudit({
    userId: user.id,
    action: "create_expense",
    entityType: "expense",
    entityId: createdExpense?.id,
    metadata: {
      propertyId,
      category,
      amountCents: Math.round(amountDollars * 100)
    }
  }).catch(
    sideEffectError("createExpense", "log_audit", {
      userId: user.id,
      entityType: "expense",
      entityId: createdExpense?.id
    })
  );

  revalidatePath("/owner");
  return { success: true };
}

export async function updateExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`updateExpense:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  void logAudit({
    userId: user.id,
    action: "update_expense",
    entityType: "expense",
    entityId: expenseId,
    metadata: {
      propertyId: existingExpense.property_id,
      category,
      amountCents: Math.round(amountDollars * 100)
    }
  }).catch(
    sideEffectError("updateExpense", "log_audit", {
      userId: user.id,
      entityType: "expense",
      entityId: expenseId
    })
  );

  revalidatePath("/owner");
  return { success: true };
}

export async function deleteExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`deleteExpense:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  void logAudit({
    userId: user.id,
    action: "delete_expense",
    entityType: "expense",
    entityId: expenseId,
    metadata: {
      propertyId: expense.property_id
    }
  }).catch(
    sideEffectError("deleteExpense", "log_audit", {
      userId: user.id,
      entityType: "expense",
      entityId: expenseId
    })
  );

  revalidatePath("/owner");
  return { success: true };
}
