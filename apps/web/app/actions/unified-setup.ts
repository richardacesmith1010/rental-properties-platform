"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createPropertyWithSetupSchema,
  parseFormData
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { inviteTenant } from "./tenant-invitations";
import { createLease } from "./lease-mutations";
import { createProperty } from "./properties";
import { createUnit } from "./units";
import type { ActionState } from "./shared";

function clampDueDay(startDate: string) {
  const parsed = new Date(`${startDate}T00:00:00.000Z`);
  const day = Number.isNaN(parsed.getTime()) ? 1 : parsed.getUTCDate();
  return String(Math.max(1, Math.min(28, day)));
}

function getTenantDisplayName(email: string) {
  const local = email.split("@")[0] ?? "Tenant";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ") || "Tenant";
}

async function cleanupSetupDraft(propertyId: string | null, unitIds: string[]) {
  if (!propertyId) {
    return;
  }

  const admin = createAdminClient();

  if (unitIds.length > 0) {
    const { error: unitError } = await admin.from("units").delete().in("id", unitIds);
    if (unitError) {
      console.error("cleanupSetupDraft unit cleanup error:", unitError);
    }
  }

  const { error: propertyError } = await admin.from("properties").delete().eq("id", propertyId);
  if (propertyError) {
    console.error("cleanupSetupDraft property cleanup error:", propertyError);
  }
}

export async function createPropertyWithSetup(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  if (!checkRateLimit(`createPropertyWithSetup:${user.id}`, 15, 60_000).allowed) {
    return { success: false, error: "Too many setup attempts. Please try again later." };
  }

  const parsed = parseFormData(createPropertyWithSetupSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { accountId, payload } = parsed.data;
  const createdUnitIds: string[] = [];
  let propertyId: string | null = null;

  const propertyFormData = new FormData();
  propertyFormData.set("name", payload.property.name);
  propertyFormData.set("addressLine1", payload.property.addressLine1);
  propertyFormData.set("city", payload.property.city);
  propertyFormData.set("state", payload.property.state);
  propertyFormData.set("postalCode", payload.property.postalCode);
  propertyFormData.set("propertyType", payload.property.propertyType);
  if (accountId) {
    propertyFormData.set("ownerAccountId", accountId);
  }

  const propertyResult = await createProperty(null, propertyFormData);
  if (!propertyResult?.success || !propertyResult.propertyId) {
    return {
      success: false,
      error:
        (propertyResult && propertyResult.success === false ? propertyResult.error : null) ??
        "Domus could not create the property shell."
    };
  }

  propertyId = propertyResult.propertyId;
  const unitIdByDraftId = new Map<string, string>();

  for (const unit of payload.units) {
    const unitFormData = new FormData();
    unitFormData.set("propertyId", propertyId);
    unitFormData.set("unitNumber", unit.label);
    unitFormData.set("bedrooms", String(unit.bedrooms));
    unitFormData.set("bathrooms", String(unit.bathrooms));
    unitFormData.set("monthlyRentDollars", String(unit.monthlyRentDollars));
    if (unit.squareFeet != null) {
      unitFormData.set("squareFeet", String(unit.squareFeet));
    }

    const unitResult = await createUnit(null, unitFormData);
    if (!unitResult?.success || !unitResult.unitId) {
      await cleanupSetupDraft(propertyId, createdUnitIds);
      return {
        success: false,
        error:
          (unitResult && unitResult.success === false ? unitResult.error : null) ??
          `The property was created, but Domus could not finish the ${unit.label} setup.`
      };
    }

    createdUnitIds.push(unitResult.unitId);
    unitIdByDraftId.set(unit.id, unitResult.unitId);
  }

  if (!payload.lease.hasTenant) {
    revalidatePath("/");
    revalidatePath("/owner");
    revalidatePath("/manager");
    return {
      success: true,
      message: "Property setup complete.",
      propertyId
    };
  }

  const leasedUnitId = payload.lease.leasedUnitId
    ? unitIdByDraftId.get(payload.lease.leasedUnitId) ?? null
    : null;
  if (!leasedUnitId) {
    await cleanupSetupDraft(propertyId, createdUnitIds);
    return {
      success: false,
      error: "Choose the unit that should receive the first lease."
    };
  }

  const tenantEmail = payload.lease.tenantEmail?.trim().toLowerCase();
  if (!tenantEmail) {
    await cleanupSetupDraft(propertyId, createdUnitIds);
    return { success: false, error: "Tenant email is required." };
  }

  const tenantInviteFormData = new FormData();
  tenantInviteFormData.set("email", tenantEmail);
  tenantInviteFormData.set("fullName", getTenantDisplayName(tenantEmail));
  tenantInviteFormData.set("propertyId", propertyId);
  tenantInviteFormData.set("unitId", leasedUnitId);
  tenantInviteFormData.set("monthlyRentDollars", String(payload.lease.monthlyRentDollars ?? 0));
  if (payload.lease.startDate) {
    tenantInviteFormData.set("leaseStartDate", payload.lease.startDate);
  }
  if (payload.lease.endDate) {
    tenantInviteFormData.set("leaseEndDate", payload.lease.endDate);
  }

  const inviteResult = await inviteTenant(null, tenantInviteFormData);
  if (!inviteResult?.success) {
    await cleanupSetupDraft(propertyId, createdUnitIds);
    return {
      success: false,
      error:
        (inviteResult && inviteResult.success === false ? inviteResult.error : null) ??
        "The property was created, but Domus could not send the tenant invitation."
    };
  }

  if (!inviteResult.tenantProfileId || !payload.lease.startDate || !payload.lease.endDate) {
    return {
      success: false,
      error:
        "The tenant invitation was sent, but Domus could not finish the lease setup. Open Leases to complete it."
    };
  }

  const leaseFormData = new FormData();
  leaseFormData.set("unitId", leasedUnitId);
  leaseFormData.set("tenantProfileId", inviteResult.tenantProfileId);
  leaseFormData.set("startDate", payload.lease.startDate);
  leaseFormData.set("endDate", payload.lease.endDate);
  leaseFormData.set("dueDayOfMonth", clampDueDay(payload.lease.startDate));
  leaseFormData.set("monthlyRentDollars", String(payload.lease.monthlyRentDollars));
  leaseFormData.set("depositDollars", String(payload.lease.depositDollars ?? 0));
  leaseFormData.set("gracePeriodDays", "5");
  leaseFormData.set("lateFeeDollars", "0");

  const leaseResult = await createLease(null, leaseFormData);
  if (!leaseResult?.success) {
    return {
      success: false,
      error:
        (leaseResult && leaseResult.success === false ? leaseResult.error : null) ??
        "The tenant was invited, but Domus could not finish the lease. Open Leases to complete it."
    };
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return {
    success: true,
    message: "Property, units, lease, and tenant invite created.",
    propertyId
  };
}
