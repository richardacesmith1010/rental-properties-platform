"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  enableAutomationSchema,
  disableAutomationSchema,
  parseFormData
} from "@/lib/validations";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

export async function enableAutomation(
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
    redirect("/portal");
  }

  const capabilityError = await ensureCapabilityEnabled("automationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(enableAutomationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, templateId } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("automation_rules").upsert(
    {
      property_id: propertyId,
      template_id: templateId,
      created_by_profile_id: user.id,
      active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "property_id,template_id" }
  );

  if (error) {
    return { success: false, error: "Failed to enable automation." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function disableAutomation(
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
    redirect("/portal");
  }

  const capabilityError = await ensureCapabilityEnabled("automationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(disableAutomationSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, templateId } = parsed.data;
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return { success: false, error: "You do not have access to this property." };
  }

  const { error } = await supabase.from("automation_rules").upsert(
    {
      property_id: propertyId,
      template_id: templateId,
      created_by_profile_id: user.id,
      active: false,
      updated_at: new Date().toISOString()
    },
    { onConflict: "property_id,template_id" }
  );

  if (error) {
    return { success: false, error: "Failed to disable automation." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

