"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createUnitSchema,
  updateUnitSchema,
  deleteUnitSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function createUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  const parsed = parseFormData(createUnitSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, unitNumber, bedrooms, bathrooms, monthlyRentDollars } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("units").insert({
    property_id: propertyId,
    unit_number: unitNumber,
    bedrooms,
    bathrooms,
    monthly_rent_cents: Math.round(monthlyRentDollars * 100),
    occupied: false
  });

  if (error) {
    return { success: false, error: "Failed to create unit. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}


export async function updateUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
