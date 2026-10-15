"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { parseFormData, updateManagementFeeSchema } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export async function updateManagementFee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner");
  if (!checkRateLimit(`updateManagementFee:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateManagementFeeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, managementFeeDollars } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "Access denied." };
  }

  const admin = createAdminClient();
  const { data: units, error: unitsError } = await admin
    .from("units")
    .select("monthly_rent_cents")
    .eq("property_id", propertyId)
    .order("monthly_rent_cents", { ascending: false })
    .limit(1);

  if (unitsError) {
    return { success: false, error: "Unable to validate the management fee for this property." };
  }

  const highestRentCents = units?.[0]?.monthly_rent_cents ?? 0;
  const managementFeeCents = Math.round(managementFeeDollars * 100);
  if (highestRentCents > 0 && managementFeeCents > highestRentCents) {
    return {
      success: false,
      error: `Management fee ($${managementFeeDollars.toFixed(2)}) cannot exceed the highest unit rent ($${(highestRentCents / 100).toFixed(2)}).`
    };
  }

  const { data: activeConfig, error: activeConfigError } = await admin.from("manager_payment_configs")
    .select("manager_profile_id, frequency")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeConfigError) {
    return { success: false, error: isMissingSchemaError(activeConfigError) ? "This feature requires a database update." : "Failed to update management fee." };
  }

  let managerProfileId = activeConfig?.manager_profile_id ?? null;
  if (!managerProfileId && managementFeeCents > 0) {
    const { data: latestManager, error: latestManagerError } = await admin.from("property_managers")
      .select("manager_profile_id")
      .eq("property_id", propertyId)
      .eq("active", true)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestManagerError) {
      return { success: false, error: isMissingSchemaError(latestManagerError) ? "This feature requires a database update." : "Failed to update management fee." };
    }

    managerProfileId = latestManager?.manager_profile_id ?? null;
  }

  if (!managerProfileId && managementFeeCents > 0) {
    return { success: false, error: "Assign an active manager to this property before setting a management fee." };
  }

  if (managerProfileId) {
    const { error } = await supabase.from("manager_payment_configs")
      .upsert({
        property_id: propertyId,
        manager_profile_id: managerProfileId,
        payment_type: "flat",
        percentage_rate: null,
        flat_amount_cents: managementFeeCents,
        base_rent_cents: null,
        label: "Property Management Fee",
        frequency: activeConfig?.frequency ?? "monthly",
        active: managementFeeCents > 0,
        updated_at: new Date().toISOString()
      }, { onConflict: "property_id,manager_profile_id" });

    if (error) {
      return { success: false, error: isMissingSchemaError(error) ? "This feature requires a database update." : "Failed to update management fee." };
    }
  }

  void logAudit({
    userId: user.id,
    action: "update_management_fee",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      propertyId,
      managementFeeCents
    }
  }).catch(
    sideEffectError("updateManagementFee", "log_audit", {
      userId: user.id,
      entityType: "property",
      entityId: propertyId
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Management fee updated." };
}
