"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createTenantActivitySchema, parseFormData } from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export type TenantActivityType = "infraction" | "notice" | "warning" | "note";

export interface TenantActivityEntry {
  id: string;
  tenantProfileId: string;
  propertyId: string;
  unitId: string | null;
  leaseId: string | null;
  activityType: TenantActivityType;
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
  authorName: string;
}

type ActivityActionError = Exclude<ActionState, null | { success: true }>;

interface ResolvedActivityContext {
  tenantProfileId: string;
  propertyId: string;
  unitId: string | null;
  leaseId: string | null;
}

function activityFeatureError(): ActivityActionError {
  return {
    success: false,
    error: "This feature requires a database update."
  };
}

async function resolveActivityContextFromLease(
  admin: ReturnType<typeof createAdminClient>,
  leaseId: string
): Promise<ResolvedActivityContext | ActivityActionError> {
  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .eq("id", leaseId)
    .maybeSingle();

  if (leaseError && isMissingSchemaError(leaseError)) {
    return activityFeatureError();
  }

  if (leaseError) {
    console.error("[tenant-activity] load lease:", leaseError);
    return { success: false, error: "Could not load that lease right now." };
  }

  if (!lease?.tenant_profile_id || !lease.unit_id) {
    return { success: false, error: "Could not find the tenant for that lease." };
  }

  const { data: unit, error: unitError } = await admin
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .maybeSingle();

  if (unitError && isMissingSchemaError(unitError)) {
    return activityFeatureError();
  }

  if (unitError) {
    console.error("[tenant-activity] load lease unit:", unitError);
    return { success: false, error: "Could not load the unit for that lease." };
  }

  if (!unit?.property_id) {
    return { success: false, error: "Could not find the property for that lease." };
  }

  return {
    tenantProfileId: lease.tenant_profile_id,
    propertyId: unit.property_id,
    unitId: lease.unit_id,
    leaseId: lease.id
  };
}

async function resolveActivityContextFromForm(
  admin: ReturnType<typeof createAdminClient>,
  tenantProfileId: string,
  propertyId: string,
  unitId?: string
): Promise<ResolvedActivityContext | ActivityActionError> {
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError && isMissingSchemaError(propertyError)) {
    return activityFeatureError();
  }

  if (propertyError) {
    console.error("[tenant-activity] load property:", propertyError);
    return { success: false, error: "Could not load that property right now." };
  }

  if (!property) {
    return { success: false, error: "Property not found." };
  }

  if (unitId) {
    const { data: unit, error: unitError } = await admin
      .from("units")
      .select("id, property_id")
      .eq("id", unitId)
      .maybeSingle();

    if (unitError && isMissingSchemaError(unitError)) {
      return activityFeatureError();
    }

    if (unitError) {
      console.error("[tenant-activity] load unit:", unitError);
      return { success: false, error: "Could not load that unit right now." };
    }

    if (!unit || unit.property_id !== propertyId) {
      return { success: false, error: "That unit does not belong to this property." };
    }
  }

  const { data: propertyUnits, error: unitsError } = await admin
    .from("units")
    .select("id")
    .eq("property_id", propertyId);

  if (unitsError && isMissingSchemaError(unitsError)) {
    return activityFeatureError();
  }

  if (unitsError) {
    console.error("[tenant-activity] list property units:", unitsError);
    return { success: false, error: "Could not verify that tenant's lease history." };
  }

  const unitIds = (propertyUnits ?? []).map((row) => row.id);
  if (unitIds.length === 0) {
    return { success: false, error: "That tenant is not linked to this property." };
  }

  const { data: linkedLease, error: leaseError } = await admin
    .from("leases")
    .select("id")
    .eq("tenant_profile_id", tenantProfileId)
    .in("unit_id", unitIds)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leaseError && isMissingSchemaError(leaseError)) {
    return activityFeatureError();
  }

  if (leaseError) {
    console.error("[tenant-activity] verify tenant property relationship:", leaseError);
    return { success: false, error: "Could not verify that tenant's lease history." };
  }

  if (!linkedLease) {
    return { success: false, error: "That tenant is not linked to this property." };
  }

  return {
    tenantProfileId,
    propertyId,
    unitId: unitId ?? null,
    leaseId: null
  };
}

export async function createTenantActivity(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");

  if (!checkRateLimit(`tenant-activity:${user.id}`, 30, 60_000).allowed) {
    return {
      success: false,
      error: "You're adding activity too fast. Please wait a minute and try again."
    };
  }

  const parsed = parseFormData(createTenantActivitySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const contextResult = parsed.data.leaseId
    ? await resolveActivityContextFromLease(admin, parsed.data.leaseId)
    : await resolveActivityContextFromForm(
        admin,
        parsed.data.tenantProfileId!,
        parsed.data.propertyId!,
        parsed.data.unitId
      );

  if ("success" in contextResult) {
    return contextResult;
  }

  if (!(await canUserAdministerProperty(user.id, contextResult.propertyId))) {
    return { success: false, error: "Access denied." };
  }

  const insertResult = await admin.from("tenant_activity_log").insert({
    tenant_profile_id: contextResult.tenantProfileId,
    property_id: contextResult.propertyId,
    unit_id: contextResult.unitId,
    lease_id: contextResult.leaseId,
    activity_type: parsed.data.activityType,
    title: parsed.data.title,
    description: parsed.data.description,
    created_by: user.id
  });

  if (insertResult.error && isMissingSchemaError(insertResult.error)) {
    return activityFeatureError();
  }

  if (insertResult.error) {
    console.error("[tenant-activity] create entry:", insertResult.error);
    return { success: false, error: "Could not save this activity entry." };
  }

  revalidatePath("/owner");
  revalidatePath("/manager");

  return {
    success: true,
    message: "Activity saved."
  };
}

export async function getTenantActivityLog(
  tenantProfileId: string,
  propertyId: string
): Promise<TenantActivityEntry[]> {
  const { user } = await requireAuth("owner", "manager");
  if (!(await canUserAdministerProperty(user.id, propertyId))) {
    return [];
  }

  const admin = createAdminClient();
  const { data: entries, error } = await admin
    .from("tenant_activity_log")
    .select(
      "id, tenant_profile_id, property_id, unit_id, lease_id, activity_type, title, description, created_by, created_at"
    )
    .eq("tenant_profile_id", tenantProfileId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error && isMissingSchemaError(error)) {
    return [];
  }

  if (error) {
    console.error("[tenant-activity] load log:", error);
    throw new Error("Could not load activity right now.");
  }

  const authorIds = Array.from(
    new Set((entries ?? []).map((entry) => entry.created_by).filter((value): value is string => Boolean(value)))
  );

  let authorsById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authors, error: authorsError } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);

    if (!authorsError) {
      authorsById = new Map(
        (authors ?? []).map((author) => [author.id, author.full_name || author.email || "Unknown"])
      );
    } else if (!isMissingSchemaError(authorsError)) {
      console.error("[tenant-activity] load authors:", authorsError);
    }
  }

  return (entries ?? []).map((entry) => ({
    id: entry.id,
    tenantProfileId: entry.tenant_profile_id,
    propertyId: entry.property_id,
    unitId: entry.unit_id,
    leaseId: entry.lease_id,
    activityType: entry.activity_type as TenantActivityType,
    title: entry.title,
    description: entry.description ?? "",
    createdAt: entry.created_at,
    createdBy: entry.created_by,
    authorName: authorsById.get(entry.created_by) ?? "Unknown"
  }));
}
