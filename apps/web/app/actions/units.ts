"use server";

import { revalidatePath } from "next/cache";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createUnitSchema,
  updateUnitFieldSchema,
  updateUnitSchema,
  deleteUnitSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function createUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`createUnit:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(createUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { data: createdUnit, error } = await supabase.from("units").insert({
    property_id: propertyId,
    unit_number: unitNumber,
    bedrooms,
    bathrooms,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    occupied: false
  }).select("id").single();

  if (error) {
    return { success: false, error: "Failed to create unit. Please try again." };
  }

  if (createdUnit?.id) {
    void awardXp(
      user.id,
      "unit_added",
      XP_VALUES.unit_added,
      "Unit added to property.",
      { unit_id: createdUnit.id, property_id: propertyId }
    ).catch(
      sideEffectError("createUnit", "award_xp", {
        userId: user.id,
        entityType: "xp_event",
        entityId: createdUnit.id
      })
    );

    void logAudit({
      userId: user.id,
      action: "create_unit",
      entityType: "unit",
      entityId: createdUnit.id,
      metadata: {
        propertyId,
        unitNumber
      }
    }).catch(
      sideEffectError("createUnit", "log_audit", {
        userId: user.id,
        entityType: "unit",
        entityId: createdUnit.id
      })
    );
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, unitId: createdUnit.id };
}


export async function updateUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateUnit:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;
  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this unit." };
  }

  const { error } = await supabase
    .from("units")
    .update({
      unit_number: unitNumber,
      bedrooms,
      bathrooms,
      monthly_rent_cents: Math.round(monthlyRentDollars * 100)
    })
    .eq("id", unitId);

  if (error) {
    return { success: false, error: "Failed to update unit. Please try again." };
  }

  void logAudit({
    userId: user.id,
    action: "update_unit",
    entityType: "unit",
    entityId: unitId,
    metadata: {
      propertyId: unit.property_id,
      unitNumber
    }
  }).catch(
    sideEffectError("updateUnit", "log_audit", {
      userId: user.id,
      entityType: "unit",
      entityId: unitId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function updateUnitField(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner");
  if (!checkRateLimit(`updateUnitField:${user.id}`, 40, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateUnitFieldSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, field, value } = parsed.data;
  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this unit." };
  }

  const updatePayload =
    field === "unitNumber"
      ? { unit_number: value }
      : { monthly_rent_cents: Math.round(value * 100) };

  const { error } = await supabase
    .from("units")
    .update(updatePayload)
    .eq("id", unitId);

  if (error) {
    return { success: false, error: "Failed to update unit. Please try again." };
  }

  void logAudit({
    userId: user.id,
    action: field === "unitNumber" ? "rename_unit" : "update_unit_rent",
    entityType: "unit",
    entityId: unitId,
    metadata: {
      propertyId: unit.property_id,
      field,
      value
    }
  }).catch(
    sideEffectError("updateUnitField", "log_audit", {
      userId: user.id,
      entityType: "unit",
      entityId: unitId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return {
    success: true,
    message: field === "unitNumber" ? "Unit label updated." : "Unit rent updated."
  };
}

export async function deleteUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`deleteUnit:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(deleteUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId } = parsed.data;
  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .single();

  if (!unit) {
    return { success: false, error: "Unit not found." };
  }

  const canAdminister = await canUserAdministerProperty(user.id, unit.property_id);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this unit." };
  }

  const { data: activeLease } = await supabase
    .from("leases")
    .select("id")
    .eq("unit_id", unitId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (activeLease) {
    return {
      success: false,
      error: "Cannot archive a unit with an active lease. Archive the lease first."
    };
  }

  const { error } = await supabase
    .from("units")
    .update({ active: false, occupied: false })
    .eq("id", unitId);

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Unit archive requires the active column migration to be applied."
    };
  }

  if (error) {
    return { success: false, error: "Failed to archive unit. Please try again." };
  }

  void logAudit({
    userId: user.id,
    action: "delete_unit",
    entityType: "unit",
    entityId: unitId,
    metadata: {
      propertyId: unit.property_id
    }
  }).catch(
    sideEffectError("deleteUnit", "log_audit", {
      userId: user.id,
      entityType: "unit",
      entityId: unitId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
