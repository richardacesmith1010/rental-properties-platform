"use server";

import { logAudit } from "@/lib/audit";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { sideEffectError } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  updateManagerInfoSchema,
  updateTenantDisplayInfoSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import {
  assertPropertyAccess,
  EDITING_REQUIRES_UPDATE_MESSAGE,
  getProfileRecord,
  hasChanges,
  revalidateEntitySurfaces
} from "./entity-updates-support";
import type { ActionState } from "./shared";

export async function updateTenantDisplayInfo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateTenantDisplayInfo:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateTenantDisplayInfoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { profileId, ...updates } = parsed.data;
  const admin = createAdminClient();

  try {
    const profile = await getProfileRecord(admin, profileId);
    if (!profile) {
      return { success: false, error: "Tenant profile not found." };
    }

    const { data: tenantLeases, error: leaseError } = await admin
      .from("leases")
      .select("unit_id")
      .eq("tenant_profile_id", profileId);
    if (leaseError) {
      throw leaseError;
    }

    const unitIds = Array.from(new Set((tenantLeases ?? []).map((lease) => lease.unit_id)));
    if (unitIds.length === 0) {
      return { success: false, error: "Tenant is not linked to a property in Domus yet." };
    }

    const { data: units, error: unitError } = await admin
      .from("units")
      .select("id, property_id")
      .in("id", unitIds);
    if (unitError) {
      throw unitError;
    }

    const administeredPropertyIds = new Set(await getAdministeredPropertyIds(user.id));
    const matchingPropertyIds = Array.from(
      new Set(
        (units ?? [])
          .map((unit) => unit.property_id)
          .filter((propertyId) => administeredPropertyIds.has(propertyId))
      )
    );

    if (matchingPropertyIds.length === 0) {
      return { success: false, error: "You do not have access to this tenant record." };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.fullName !== undefined && updates.fullName !== profile.full_name) {
      updatePayload.full_name = updates.fullName;
    }
    if (updates.email !== undefined && updates.email !== profile.email) {
      updatePayload.email = updates.email.toLowerCase();
    }
    if (updates.phone !== undefined && updates.phone !== profile.phone) {
      updatePayload.phone = updates.phone;
    }

    if (!hasChanges(updatePayload)) {
      return { success: false, error: "No tenant changes to save." };
    }

    const { error: updateError } = await admin.from("profiles").update(updatePayload).eq("id", profileId);
    if (updateError) {
      if (isMissingSchemaError(updateError) && "phone" in updatePayload) {
        return { success: false, error: EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      throw updateError;
    }

    void logAudit({
      userId: user.id,
      action: "update_tenant_display_info",
      entityType: "profile",
      entityId: profileId,
      metadata: {
        propertyIds: matchingPropertyIds,
        changedFields: Object.keys(updatePayload)
      }
    }).catch(
      sideEffectError("updateTenantDisplayInfo", "log_audit", {
        userId: user.id,
        entityType: "profile",
        entityId: profileId
      })
    );

    revalidateEntitySurfaces();
    return { success: true, message: "Tenant details updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this tenant right now."
    };
  }
}

export async function updateManagerInfo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateManagerInfo:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateManagerInfoSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, managerProfileId, configId, ...updates } = parsed.data;
  const admin = createAdminClient();

  try {
    if (!(await assertPropertyAccess(user.id, propertyId))) {
      return { success: false, error: "You do not have access to this manager record." };
    }

    const [managerProfile, configResult] = await Promise.all([
      getProfileRecord(admin, managerProfileId),
      configId
        ? admin
            .from("manager_payment_configs")
            .select(
              "id, property_id, manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, label, frequency"
            )
            .eq("id", configId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    if (!managerProfile) {
      return { success: false, error: "Manager profile not found." };
    }
    if (configResult.error) {
      if (isMissingSchemaError(configResult.error)) {
        return { success: false, error: EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      throw configResult.error;
    }

    const config = configResult.data;
    if (config && (config.property_id !== propertyId || config.manager_profile_id !== managerProfileId)) {
      return { success: false, error: "Manager payment terms not found for this property." };
    }

    const profileUpdatePayload: Record<string, unknown> = {};
    if (updates.fullName !== undefined && updates.fullName !== managerProfile.full_name) {
      profileUpdatePayload.full_name = updates.fullName;
    }
    if (updates.email !== undefined && updates.email !== managerProfile.email) {
      profileUpdatePayload.email = updates.email.toLowerCase();
    }

    const configUpdatePayload: Record<string, unknown> = {};
    if (config) {
      const nextPaymentType = updates.paymentType ?? config.payment_type;
      const nextPercentageRate =
        updates.percentageRate !== undefined ? updates.percentageRate : config.percentage_rate;
      const nextFlatAmountCents =
        updates.flatAmountDollars !== undefined
          ? updates.flatAmountDollars == null
            ? null
            : Math.round(Number(updates.flatAmountDollars) * 100)
          : config.flat_amount_cents;
      const nextBaseRentCents =
        updates.baseRentDollars !== undefined
          ? updates.baseRentDollars == null
            ? null
            : Math.round(Number(updates.baseRentDollars) * 100)
          : config.base_rent_cents;
      const nextLabel = updates.label ?? config.label;
      const nextFrequency = updates.frequency ?? config.frequency;

      if (nextPaymentType === "percentage" && nextPercentageRate == null) {
        return { success: false, error: "Percentage-based manager payments require a percentage rate." };
      }
      if (nextPaymentType === "flat" && nextFlatAmountCents == null) {
        return { success: false, error: "Flat-fee manager payments require an amount." };
      }

      if (updates.label !== undefined && updates.label !== config.label) {
        configUpdatePayload.label = nextLabel;
      }
      if (updates.paymentType !== undefined && updates.paymentType !== config.payment_type) {
        configUpdatePayload.payment_type = nextPaymentType;
      }
      if (updates.percentageRate !== undefined || nextPaymentType === "percentage") {
        if (nextPercentageRate !== config.percentage_rate || nextPaymentType !== config.payment_type) {
          configUpdatePayload.percentage_rate = nextPaymentType === "percentage" ? nextPercentageRate : null;
        }
      }
      if (updates.flatAmountDollars !== undefined || nextPaymentType === "flat") {
        if (nextFlatAmountCents !== config.flat_amount_cents || nextPaymentType !== config.payment_type) {
          configUpdatePayload.flat_amount_cents = nextPaymentType === "flat" ? nextFlatAmountCents : null;
        }
      }
      if (updates.baseRentDollars !== undefined && nextBaseRentCents !== config.base_rent_cents) {
        configUpdatePayload.base_rent_cents = nextBaseRentCents;
      }
      if (updates.frequency !== undefined && nextFrequency !== config.frequency) {
        configUpdatePayload.frequency = nextFrequency;
      }
    }

    if (!hasChanges(profileUpdatePayload) && !hasChanges(configUpdatePayload)) {
      return { success: false, error: "No manager changes to save." };
    }

    if (hasChanges(profileUpdatePayload)) {
      const { error: profileUpdateError } = await admin
        .from("profiles")
        .update(profileUpdatePayload)
        .eq("id", managerProfileId);
      if (profileUpdateError) {
        throw profileUpdateError;
      }
    }

    if (configId && hasChanges(configUpdatePayload)) {
      const { error: configUpdateError } = await admin
        .from("manager_payment_configs")
        .update(configUpdatePayload)
        .eq("id", configId);
      if (configUpdateError) {
        if (isMissingSchemaError(configUpdateError)) {
          return { success: false, error: EDITING_REQUIRES_UPDATE_MESSAGE };
        }
        throw configUpdateError;
      }
    }

    void logAudit({
      userId: user.id,
      action: "update_manager_info",
      entityType: "profile",
      entityId: managerProfileId,
      metadata: {
        propertyId,
        configId,
        changedFields: [...Object.keys(profileUpdatePayload), ...Object.keys(configUpdatePayload)]
      }
    }).catch(
      sideEffectError("updateManagerInfo", "log_audit", {
        userId: user.id,
        entityType: "profile",
        entityId: managerProfileId
      })
    );

    revalidateEntitySurfaces();
    return { success: true, message: "Manager details updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this manager right now."
    };
  }
}
