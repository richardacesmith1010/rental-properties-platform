"use server";

import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { sideEffectError } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  parseFormData,
  updateLeaseDetailsSchema,
  updatePropertyDetailsSchema,
  updateUnitDetailsSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import {
  assertPropertyAccess,
  EDITING_REQUIRES_UPDATE_MESSAGE,
  getLeaseRecord,
  getUnitRecord,
  hasChanges,
  isDateAfter,
  revalidateEntitySurfaces
} from "./entity-updates-support";

export async function updatePropertyDetails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updatePropertyDetails:${user.id}`, 40, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updatePropertyDetailsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, ...updates } = parsed.data;
  const admin = createAdminClient();

  try {
    if (!(await assertPropertyAccess(user.id, propertyId))) {
      return { success: false, error: "You do not have access to this property." };
    }

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError) {
      throw propertyError;
    }
    if (!property) {
      return { success: false, error: "Property not found." };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.name !== undefined && updates.name !== property.name) updatePayload.name = updates.name;
    if (updates.addressLine1 !== undefined && updates.addressLine1 !== property.address_line1) {
      updatePayload.address_line1 = updates.addressLine1;
    }
    if (updates.city !== undefined && updates.city !== property.city) updatePayload.city = updates.city;
    if (updates.state !== undefined && updates.state !== property.state) updatePayload.state = updates.state;
    if (updates.postalCode !== undefined && updates.postalCode !== property.postal_code) {
      updatePayload.postal_code = updates.postalCode;
    }

    if (!hasChanges(updatePayload)) {
      return { success: false, error: "No property changes to save." };
    }

    const { error: updateError } = await admin.from("properties").update(updatePayload).eq("id", propertyId);
    if (updateError) {
      throw updateError;
    }

    void logAudit({
      userId: user.id,
      action: "update_property_details",
      entityType: "property",
      entityId: propertyId,
      metadata: {
        propertyId,
        changedFields: Object.keys(updatePayload)
      }
    }).catch(
      sideEffectError("updatePropertyDetails", "log_audit", {
        userId: user.id,
        entityType: "property",
        entityId: propertyId
      })
    );

    revalidateEntitySurfaces();
    return { success: true, message: "Property updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this property right now."
    };
  }
}

export async function updateUnitDetails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateUnitDetails:${user.id}`, 40, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateUnitDetailsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { unitId, ...updates } = parsed.data;
  const admin = createAdminClient();

  try {
    const unit = await getUnitRecord(admin, unitId);
    if (!unit) {
      return { success: false, error: "Unit not found." };
    }

    if (!(await assertPropertyAccess(user.id, unit.property_id))) {
      return { success: false, error: "You do not have access to this unit." };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.unitNumber !== undefined && updates.unitNumber !== unit.unit_number) {
      updatePayload.unit_number = updates.unitNumber;
    }
    if (updates.bedrooms !== undefined && updates.bedrooms !== unit.bedrooms) {
      updatePayload.bedrooms = updates.bedrooms;
    }
    if (updates.bathrooms !== undefined && updates.bathrooms !== unit.bathrooms) {
      updatePayload.bathrooms = updates.bathrooms;
    }
    if (updates.monthlyRentDollars != null) {
      const nextRentCents = Math.round(updates.monthlyRentDollars * 100);
      if (nextRentCents !== unit.monthly_rent_cents) {
        updatePayload.monthly_rent_cents = nextRentCents;
      }
    } else if (updates.monthlyRentDollars === null && unit.monthly_rent_cents !== 0) {
      updatePayload.monthly_rent_cents = 0;
    }
    if (updates.squareFeet !== undefined && updates.squareFeet !== unit.square_feet) {
      updatePayload.square_feet = updates.squareFeet;
    }

    if (!hasChanges(updatePayload)) {
      return { success: false, error: "No unit changes to save." };
    }

    const { error: updateError } = await admin.from("units").update(updatePayload).eq("id", unitId);
    if (updateError) {
      if (isMissingSchemaError(updateError) && "square_feet" in updatePayload) {
        return { success: false, error: EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      throw updateError;
    }

    void logAudit({
      userId: user.id,
      action: "update_unit_details",
      entityType: "unit",
      entityId: unitId,
      metadata: {
        propertyId: unit.property_id,
        changedFields: Object.keys(updatePayload)
      }
    }).catch(
      sideEffectError("updateUnitDetails", "log_audit", {
        userId: user.id,
        entityType: "unit",
        entityId: unitId
      })
    );

    revalidateEntitySurfaces();
    return { success: true, message: "Unit updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this unit right now."
    };
  }
}

export async function updateLeaseDetails(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`updateLeaseDetails:${user.id}`, 40, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateLeaseDetailsSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId, ...updates } = parsed.data;
  const admin = createAdminClient();

  try {
    const lease = await getLeaseRecord(admin, leaseId);
    if (!lease) {
      return { success: false, error: "Lease not found." };
    }

    const unit = await getUnitRecord(admin, lease.unit_id);
    if (!unit) {
      return { success: false, error: "Unit not found for this lease." };
    }

    if (!(await assertPropertyAccess(user.id, unit.property_id))) {
      return { success: false, error: "You do not have access to this lease." };
    }

    const nextStartDate = updates.startDate ?? lease.start_date;
    const nextEndDate = updates.endDate ?? lease.end_date;
    if (!isDateAfter(nextStartDate, nextEndDate)) {
      return { success: false, error: "End date must be after start date." };
    }

    const updatePayload: Record<string, unknown> = {};
    if (updates.startDate !== undefined && updates.startDate !== lease.start_date) {
      updatePayload.start_date = updates.startDate;
    }
    if (updates.endDate !== undefined && updates.endDate !== lease.end_date) {
      updatePayload.end_date = updates.endDate;
    }
    if (updates.monthlyRentDollars != null) {
      const nextRentCents = Math.round(updates.monthlyRentDollars * 100);
      if (nextRentCents !== lease.monthly_rent_cents) {
        updatePayload.monthly_rent_cents = nextRentCents;
      }
    }
    if (updates.depositDollars != null) {
      const nextDepositCents = Math.round(updates.depositDollars * 100);
      if (nextDepositCents !== lease.deposit_cents) {
        updatePayload.deposit_cents = nextDepositCents;
      }
    } else if (updates.depositDollars === null && lease.deposit_cents !== 0) {
      updatePayload.deposit_cents = 0;
    }
    if (updates.dueDayOfMonth !== undefined && updates.dueDayOfMonth !== lease.due_day_of_month) {
      updatePayload.due_day_of_month = updates.dueDayOfMonth;
    }
    if (updates.gracePeriodDays !== undefined && updates.gracePeriodDays !== lease.grace_period_days) {
      updatePayload.grace_period_days = updates.gracePeriodDays;
    }
    if (updates.lateFeeDollars != null) {
      const nextLateFeeCents = Math.round(updates.lateFeeDollars * 100);
      if (nextLateFeeCents !== lease.late_fee_cents) {
        updatePayload.late_fee_cents = nextLateFeeCents;
      }
    } else if (updates.lateFeeDollars === null && lease.late_fee_cents !== 0) {
      updatePayload.late_fee_cents = 0;
    }
    if (updates.notes !== undefined && updates.notes !== lease.notes) {
      updatePayload.notes = updates.notes;
    }

    if (!hasChanges(updatePayload)) {
      return { success: false, error: "No lease changes to save." };
    }

    const { error: updateError } = await admin.from("leases").update(updatePayload).eq("id", leaseId);
    if (updateError) {
      if (isMissingSchemaError(updateError) && "notes" in updatePayload) {
        return { success: false, error: EDITING_REQUIRES_UPDATE_MESSAGE };
      }
      throw updateError;
    }

    void logAudit({
      userId: user.id,
      action: "update_lease_details",
      entityType: "lease",
      entityId: leaseId,
      metadata: {
        propertyId: unit.property_id,
        tenantProfileId: lease.tenant_profile_id,
        changedFields: Object.keys(updatePayload)
      }
    }).catch(
      sideEffectError("updateLeaseDetails", "log_audit", {
        userId: user.id,
        entityType: "lease",
        entityId: leaseId
      })
    );

    revalidateEntitySurfaces();
    return { success: true, message: "Lease updated." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update this lease right now."
    };
  }
}
