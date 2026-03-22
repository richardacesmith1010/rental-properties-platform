"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { sideEffectError } from "@/lib/logger";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  createManualChargeSchema,
  deletePendingChargeSchema,
  editChargeSchema,
  parseFormData,
  updateLeaseRentAmountSchema,
  waiveChargeSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE =
  "Charge editing requires a database update. Apply the Sprint 72 migration and retry.";

type ChargeRecord = {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  category: string | null;
  notes?: string | null;
  deleted_at?: string | null;
};

type ChargeContext = {
  charge: ChargeRecord;
  propertyId: string;
};

function isValidDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

async function getChargeRecord(admin: ReturnType<typeof createAdminClient>, chargeId: string) {
  const result = await withChargeEditingFallback(
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, category, notes, deleted_at")
        .eq("id", chargeId)
        .maybeSingle(),
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, category")
        .eq("id", chargeId)
        .maybeSingle()
  );

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      throw new Error(CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE);
    }
    throw result.error;
  }

  return (result.data ?? null) as ChargeRecord | null;
}

async function getChargeContext(
  admin: ReturnType<typeof createAdminClient>,
  chargeId: string
): Promise<ChargeContext | null> {
  const charge = await getChargeRecord(admin, chargeId);
  if (!charge) {
    return null;
  }

  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .select("id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (leaseError) {
    throw leaseError;
  }
  if (!lease) {
    return null;
  }

  const { data: unit, error: unitError } = await admin
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .maybeSingle();
  if (unitError) {
    throw unitError;
  }
  if (!unit) {
    return null;
  }

  return {
    charge,
    propertyId: unit.property_id
  };
}

async function insertChargeHistory(
  admin: ReturnType<typeof createAdminClient>,
  entries: Array<{
    charge_id: string;
    edited_by: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
  }>
) {
  if (entries.length === 0) {
    return;
  }

  const { error } = await admin.from("charge_edit_history").insert(entries);
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error(CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE);
    }
    throw error;
  }
}

function revalidateChargeSurfaces() {
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/owner/reports");
}

export async function editCharge(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`editCharge:${user.id}`, 40, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(editChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { chargeId, amountDollars, dueDate, category, notes, reason, status } = parsed.data;
  if (!isValidDateOnly(dueDate)) {
    return { success: false, error: "Enter a valid due date." };
  }

  const admin = createAdminClient();

  try {
    const context = await getChargeContext(admin, chargeId);
    if (!context) {
      return { success: false, error: "Charge not found." };
    }

    if (!(await canUserAdministerProperty(user.id, context.propertyId))) {
      return { success: false, error: "Access denied." };
    }

    if (context.charge.deleted_at) {
      return { success: false, error: "Deleted charges cannot be edited." };
    }

    if (context.charge.status === "paid") {
      return { success: false, error: "Paid charges cannot be edited." };
    }

    const nextAmountCents = Math.round(amountDollars * 100);
    const nextNotes = notes?.trim() || null;
    const changeEntries: Array<{
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [
      { fieldName: "amount_cents", oldValue: String(context.charge.amount_cents), newValue: String(nextAmountCents) },
      { fieldName: "due_date", oldValue: context.charge.due_date, newValue: dueDate },
      { fieldName: "category", oldValue: context.charge.category ?? null, newValue: category },
      { fieldName: "status", oldValue: context.charge.status, newValue: status },
      { fieldName: "notes", oldValue: context.charge.notes ?? null, newValue: nextNotes }
    ].filter((entry) => entry.oldValue !== entry.newValue);

    if (changeEntries.length === 0) {
      return { success: false, error: "No changes to save." };
    }

    const { error: updateError } = await admin
      .from("rent_charges")
      .update({
        amount_cents: nextAmountCents,
        due_date: dueDate,
        category,
        status,
        notes: nextNotes
      })
      .eq("id", chargeId);

    if (updateError) {
      if (isMissingSchemaError(updateError)) {
        return { success: false, error: CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      if (updateError.message?.includes("rent_charges_status_check")) {
        return { success: false, error: CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      return { success: false, error: "Unable to update this charge right now." };
    }

    await insertChargeHistory(
      admin,
      changeEntries.map(({ fieldName, oldValue, newValue }) => ({
        charge_id: chargeId,
        edited_by: user.id,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        reason
      }))
    );

    void logAudit({
      userId: user.id,
      action: "edit_charge",
      entityType: "rent_charge",
      entityId: chargeId,
      metadata: { propertyId: context.propertyId, changedFields: changeEntries.map((entry) => entry.fieldName), reason }
    }).catch(sideEffectError("editCharge", "log_audit", { userId: user.id, entityType: "rent_charge", entityId: chargeId }));

    revalidateChargeSurfaces();
    return { success: true, message: "Charge updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this charge right now."
    };
  }
}

export async function createManualCharge(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`createManualCharge:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(createManualChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId, amountDollars, dueDate, category, notes } = parsed.data;
  if (!isValidDateOnly(dueDate)) {
    return { success: false, error: "Enter a valid due date." };
  }

  const admin = createAdminClient();

  try {
    const { data: lease, error: leaseError } = await admin
      .from("leases")
      .select("id, unit_id")
      .eq("id", leaseId)
      .maybeSingle();
    if (leaseError) {
      throw leaseError;
    }
    if (!lease) {
      return { success: false, error: "Lease not found." };
    }

    const { data: unit, error: unitError } = await admin
      .from("units")
      .select("id, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle();
    if (unitError) {
      throw unitError;
    }
    if (!unit) {
      return { success: false, error: "Unit not found for this lease." };
    }

    if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
      return { success: false, error: "Access denied." };
    }

    const nextAmountCents = Math.round(amountDollars * 100);
    const insertResult = await withChargeEditingFallback(
      () =>
        admin
          .from("rent_charges")
          .insert({
            lease_id: leaseId,
            due_date: dueDate,
            amount_cents: nextAmountCents,
            status: "pending",
            category,
            notes: notes?.trim() || null
          })
          .select("id")
          .single(),
      () =>
        admin
          .from("rent_charges")
          .insert({
            lease_id: leaseId,
            due_date: dueDate,
            amount_cents: nextAmountCents,
            status: "pending",
            category
          })
          .select("id")
          .single()
    );

    if (insertResult.error) {
      return { success: false, error: "Unable to create this manual charge right now." };
    }
    const insertedCharge = insertResult.data as { id: string } | null;

    void logAudit({
      userId: user.id,
      action: "create_manual_charge",
      entityType: "rent_charge",
      entityId: insertedCharge?.id,
      metadata: {
        propertyId: unit.property_id,
        leaseId,
        amountCents: nextAmountCents,
        category
      }
    }).catch(sideEffectError("createManualCharge", "log_audit", { userId: user.id, entityType: "rent_charge", entityId: leaseId }));

    revalidateChargeSurfaces();
    return { success: true, message: "Manual charge created." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to create this manual charge right now."
    };
  }
}

export async function deleteCharge(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`deleteCharge:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(deletePendingChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();

  try {
    const context = await getChargeContext(admin, parsed.data.chargeId);
    if (!context) {
      return { success: false, error: "Charge not found." };
    }

    if (!(await canUserAdministerProperty(user.id, context.propertyId))) {
      return { success: false, error: "Access denied." };
    }

    if (context.charge.deleted_at) {
      return { success: false, error: "This charge has already been deleted." };
    }

    if (context.charge.status === "paid") {
      return { success: false, error: "Paid charges cannot be deleted." };
    }

    const reason = parsed.data.reason?.trim() || "Charge deleted from dashboard";
    const { error } = await admin
      .from("rent_charges")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsed.data.chargeId);
    if (error) {
      if (isMissingSchemaError(error)) {
        return { success: false, error: CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      return { success: false, error: "Unable to delete this charge right now." };
    }

    await insertChargeHistory(admin, [
      {
        charge_id: parsed.data.chargeId,
        edited_by: user.id,
        field_name: "deleted",
        old_value: context.charge.status,
        new_value: "deleted",
        reason
      }
    ]);

    revalidateChargeSurfaces();
    return { success: true, message: "Charge deleted." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to delete this charge right now."
    };
  }
}

export async function waiveCharge(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`waiveCharge:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(waiveChargeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  try {
    const context = await getChargeContext(admin, parsed.data.chargeId);
    if (!context) {
      return { success: false, error: "Charge not found." };
    }

    if (!(await canUserAdministerProperty(user.id, context.propertyId))) {
      return { success: false, error: "Access denied." };
    }

    if (context.charge.deleted_at) {
      return { success: false, error: "Deleted charges cannot be waived." };
    }

    if (context.charge.status === "paid") {
      return { success: false, error: "Paid charges cannot be waived." };
    }

    const { error } = await admin
      .from("rent_charges")
      .update({ status: "waived" })
      .eq("id", parsed.data.chargeId);
    if (error) {
      if (isMissingSchemaError(error) || error.message?.includes("rent_charges_status_check")) {
        return { success: false, error: CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      return { success: false, error: "Unable to waive this charge right now." };
    }

    await insertChargeHistory(admin, [
      {
        charge_id: parsed.data.chargeId,
        edited_by: user.id,
        field_name: "status",
        old_value: context.charge.status,
        new_value: "waived",
        reason: parsed.data.reason?.trim() || "Charge waived from dashboard"
      }
    ]);

    revalidateChargeSurfaces();
    return { success: true, message: "Charge waived." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to waive this charge right now."
    };
  }
}

export async function updateLeaseRentAmount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateLeaseRentAmount:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateLeaseRentAmountSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();

  try {
    const { data: lease, error: leaseError } = await admin
      .from("leases")
      .select("id, unit_id, monthly_rent_cents")
      .eq("id", parsed.data.leaseId)
      .maybeSingle();
    if (leaseError) {
      throw leaseError;
    }
    if (!lease) {
      return { success: false, error: "Lease not found." };
    }

    const { data: unit, error: unitError } = await admin
      .from("units")
      .select("id, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle();
    if (unitError) {
      throw unitError;
    }
    if (!unit) {
      return { success: false, error: "Unit not found for this lease." };
    }

    if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
      return { success: false, error: "Access denied." };
    }

    const nextAmountCents = Math.round(parsed.data.monthlyRentDollars * 100);
    const { error } = await admin
      .from("leases")
      .update({ monthly_rent_cents: nextAmountCents })
      .eq("id", parsed.data.leaseId);
    if (error) {
      return { success: false, error: "Unable to update the recurring rent amount right now." };
    }

    void logAudit({
      userId: user.id,
      action: "update_lease_rent_amount",
      entityType: "lease",
      entityId: parsed.data.leaseId,
      metadata: {
        propertyId: unit.property_id,
        previousMonthlyRentCents: lease.monthly_rent_cents,
        nextMonthlyRentCents: nextAmountCents
      }
    }).catch(sideEffectError("updateLeaseRentAmount", "log_audit", { userId: user.id, entityType: "lease", entityId: parsed.data.leaseId }));

    revalidateChargeSurfaces();
    return { success: true, message: "Recurring rent amount updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update the recurring rent amount right now."
    };
  }
}
