import { revalidatePath } from "next/cache";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const EDITING_REQUIRES_UPDATE_MESSAGE =
  "This edit requires a database update. Apply the latest schema changes and retry.";

export function revalidateEntitySurfaces() {
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  revalidatePath("/owner/reports");
}

export function hasChanges(updatePayload: Record<string, unknown>) {
  return Object.keys(updatePayload).length > 0;
}

export function isDateAfter(startDate: string, endDate: string) {
  return new Date(`${endDate}T00:00:00.000Z`).getTime() > new Date(`${startDate}T00:00:00.000Z`).getTime();
}

export async function getUnitRecord(admin: ReturnType<typeof createAdminClient>, unitId: string) {
  const result = await admin
    .from("units")
    .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, square_feet")
    .eq("id", unitId)
    .maybeSingle();

  if (result.error && isMissingSchemaError(result.error)) {
    const fallback = await admin
      .from("units")
      .select("id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents")
      .eq("id", unitId)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    return fallback.data
      ? {
          ...fallback.data,
          square_feet: null as number | null
        }
      : null;
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function getLeaseRecord(admin: ReturnType<typeof createAdminClient>, leaseId: string) {
  const result = await admin
    .from("leases")
    .select(
      "id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, grace_period_days, late_fee_cents, tenant_profile_id, notes"
    )
    .eq("id", leaseId)
    .maybeSingle();

  if (result.error && isMissingSchemaError(result.error)) {
    const fallback = await admin
      .from("leases")
      .select(
        "id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, grace_period_days, late_fee_cents, tenant_profile_id"
      )
      .eq("id", leaseId)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    return fallback.data
      ? {
          ...fallback.data,
          notes: null as string | null
        }
      : null;
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function getProfileRecord(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const result = await admin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error && isMissingSchemaError(result.error)) {
    const fallback = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", profileId)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    return fallback.data
      ? {
          ...fallback.data,
          phone: null as string | null
        }
      : null;
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function assertPropertyAccess(userId: string, propertyId: string) {
  const propertyIds = await getAdministeredPropertyIds(userId);
  return propertyIds.includes(propertyId);
}
