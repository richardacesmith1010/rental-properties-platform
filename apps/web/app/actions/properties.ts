"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  canUserAdministerOwnershipAccount,
  getOrCreateIndividualOwnershipAccount
} from "@/lib/ownership";
import {
  createPropertySchema,
  updatePropertySchema,
  deletePropertySchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function createProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(createPropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const capabilities = await getFeatureCapabilities();
  const { name, addressLine1, city, state, postalCode, ownerAccountId } = parsed.data;
  let property: { id: string } | null = null;
  let error: { message: string } | null = null;

  if (capabilities.ownershipEnabled) {
    let targetOwnerAccountId = ownerAccountId;

    if (!targetOwnerAccountId) {
      targetOwnerAccountId = await getOrCreateIndividualOwnershipAccount(user.id);
    } else {
      const canUseAccount = await canUserAdministerOwnershipAccount(user.id, targetOwnerAccountId);
      if (!canUseAccount) {
        return { success: false, error: "You do not have access to that ownership account." };
      }
    }

    const insertResult = await supabase.from("properties").insert({
      owner_profile_id: user.id,
      owner_account_id: targetOwnerAccountId,
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    }).select("id").single();
    property = insertResult.data;
    error = insertResult.error;
  } else {
    const insertResult = await supabase.from("properties").insert({
      owner_profile_id: user.id,
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    }).select("id").single();
    property = insertResult.data;
    error = insertResult.error;
  }

  if (error) {
    return { success: false, error: "Failed to create property. Please try again." };
  }

  if (role === "manager" && property?.id) {
    const admin = createAdminClient();
    await admin.from("property_managers").upsert(
      {
        property_id: property.id,
        manager_profile_id: user.id,
        active: true
      },
      { onConflict: "property_id,manager_profile_id" }
    );
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}


export async function updateProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(updatePropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, name, addressLine1, city, state, postalCode } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase
    .from("properties")
    .update({
      name,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode
    })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to update property. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function deleteProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/portal");
  }

  const parsed = parseFormData(deletePropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { data: units } = await supabase
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  const unitIds = (units ?? []).map((unit) => unit.id);
  if (unitIds.length > 0) {
    const { data: activeLease } = await supabase
      .from("leases")
      .select("id")
      .in("unit_id", unitIds)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (activeLease) {
      return {
        success: false,
        error: "Cannot archive a property with active leases. Archive leases first."
      };
    }
  }

  const { error } = await supabase
    .from("properties")
    .update({ active: false })
    .eq("id", propertyId);

  if (error && await isMissingSchemaError(error)) {
    return {
      success: false,
      error: "Property archive requires the active column migration to be applied."
    };
  }

  if (error) {
    return { success: false, error: "Failed to archive property. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
