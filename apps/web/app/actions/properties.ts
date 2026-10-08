"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveClientManager } from "@/lib/client-accounts";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  canUserAdministerOwnershipAccount,
  getOrCreateIndividualOwnershipAccount
} from "@/lib/ownership";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createPropertySchema,
  renamePropertySchema,
  updatePropertySchema,
  deletePropertySchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function createProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, role } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`createProperty:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(createPropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  if (role === "manager") {
    const { ownerAccountId, name, addressLine1, city, state, postalCode, propertyType } = parsed.data;
    if (!ownerAccountId) return { success: false, error: "Pick whose home this is." };
    try {
      if (!(await isActiveClientManager(user.id, ownerAccountId))) {
        return { success: false, error: "You can't add homes for this client." };
      }
    } catch {
      return { success: false, error: "Could not add the home. Please try again." };
    }
    try {
      const { data, error } = await createAdminClient().rpc("add_client_home", {
        p_manager: user.id, p_account: ownerAccountId, p_name: name,
        p_address_line1: addressLine1, p_city: city, p_state: state,
        p_postal_code: postalCode, p_property_type: propertyType ?? null
      });
      if (error) return {
        success: false,
        error: error.code === "22023" ? "Please check the details and try again."
          : error.code === "42501" ? "You can't add homes for this client."
            : "Could not add the home. Please try again."
      };
      revalidatePath("/manager");
      return { success: true, propertyId: data, message: "Home added." };
    } catch {
      return { success: false, error: "Could not add the home. Please try again." };
    }
  }

  const admin = createAdminClient();
  const capabilities = await getFeatureCapabilities();
  const { name, addressLine1, city, state, postalCode, propertyType, ownerAccountId } = parsed.data;
  let property: { id: string } | null = null;
  let error: { message: string } | null = null;
  const basePayload = {
    owner_profile_id: user.id,
    name,
    address_line1: addressLine1,
    city,
    state,
    postal_code: postalCode,
    ...(propertyType ? { property_type: propertyType } : {})
  };

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

    let insertResult = await admin.from("properties").insert({
      ...basePayload,
      owner_account_id: targetOwnerAccountId
    }).select("id").single();
    if (insertResult.error && isMissingSchemaError(insertResult.error)) {
      insertResult = await admin.from("properties").insert({
        owner_profile_id: user.id,
        owner_account_id: targetOwnerAccountId,
        name,
        address_line1: addressLine1,
        city,
        state,
        postal_code: postalCode
      }).select("id").single();
    }
    property = insertResult.data;
    error = insertResult.error;
  } else {
    let insertResult = await admin.from("properties").insert(basePayload).select("id").single();
    if (insertResult.error && isMissingSchemaError(insertResult.error)) {
      insertResult = await admin.from("properties").insert({
        owner_profile_id: user.id,
        name,
        address_line1: addressLine1,
        city,
        state,
        postal_code: postalCode
      }).select("id").single();
    }
    property = insertResult.data;
    error = insertResult.error;
  }

  if (error) {
    console.error("createProperty insert error:", JSON.stringify(error));
    return { success: false, error: `Failed to create property. (${error.message})` };
  }

  if (property?.id) {

    void logAudit({
      userId: user.id,
      action: "create_property",
      entityType: "property",
      entityId: property.id,
      metadata: {
        propertyId: property.id,
        propertyName: name
      }
    }).catch(
      sideEffectError("createProperty", "log_audit", {
        userId: user.id,
        entityType: "property",
        entityId: property.id
      })
    );
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, propertyId: property?.id };
}


export async function updateProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateProperty:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  void logAudit({
    userId: user.id,
    action: "update_property",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      propertyId,
      propertyName: name
    }
  }).catch(
    sideEffectError("updateProperty", "log_audit", {
      userId: user.id,
      entityType: "property",
      entityId: propertyId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function renameProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner");
  if (!checkRateLimit(`renameProperty:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(renamePropertySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, name } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase
    .from("properties")
    .update({ name })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to rename property. Please try again." };
  }

  void logAudit({
    userId: user.id,
    action: "rename_property",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      propertyId,
      propertyName: name
    }
  }).catch(
    sideEffectError("renameProperty", "log_audit", {
      userId: user.id,
      entityType: "property",
      entityId: propertyId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Property renamed." };
}

export async function deleteProperty(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`deleteProperty:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
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

  void logAudit({
    userId: user.id,
    action: "delete_property",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      propertyId
    }
  }).catch(
    sideEffectError("deleteProperty", "log_audit", {
      userId: user.id,
      entityType: "property",
      entityId: propertyId
    })
  );

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
