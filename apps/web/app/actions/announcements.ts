"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  ANNOUNCEMENT_ENTITY_TYPE,
  ANNOUNCEMENT_NOTIFICATION_TYPE,
  type AnnouncementScope
} from "@/lib/announcements";
import type { NotificationRecipientRole } from "@/lib/notification-actions";
import { createNotificationWithDelivery } from "@/lib/notifications";
import {
  getAdministeredPropertyIds
} from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  announcementTargetingSchema,
  createAnnouncementSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import {
  ensureCapabilityEnabled,
  type ActionState
} from "./shared";

interface AnnouncementTargetingInput {
  scope: AnnouncementScope;
  propertyIds?: string[];
}

type VerifiedPropertyResult =
  | {
      success: true;
      propertyIds: string[];
    }
  | {
      success: false;
      error: string;
    };

function normalizePropertyIds(propertyIds: string[] | undefined) {
  return Array.from(
    new Set(
      (propertyIds ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function resolveVerifiedAnnouncementPropertyIds(
  userId: string,
  input: AnnouncementTargetingInput,
  adminClient?: ReturnType<typeof createAdminClient>
): Promise<VerifiedPropertyResult> {
  const administeredPropertyIds = await getAdministeredPropertyIds(userId, adminClient);
  const canonicalAdministeredPropertyIds = Array.from(new Set(administeredPropertyIds));

  if (input.scope === "all_administered") {
    return {
      success: true,
      propertyIds: canonicalAdministeredPropertyIds
    };
  }

  const requestedPropertyIds = normalizePropertyIds(input.propertyIds);
  if (requestedPropertyIds.length === 0) {
    return { success: false, error: "Select at least one property." };
  }

  const administeredPropertyIdSet = new Set(canonicalAdministeredPropertyIds);
  for (const propertyId of requestedPropertyIds) {
    if (!administeredPropertyIdSet.has(propertyId)) {
      return {
        success: false,
        error: "You don't have permission to message all selected properties."
      };
    }
  }

  return {
    success: true,
    propertyIds: requestedPropertyIds
  };
}

async function getTargetTenantIdsForProperties(
  propertyIds: string[],
  adminClient?: ReturnType<typeof createAdminClient>
) {
  const admin = adminClient ?? createAdminClient();
  const { data: units, error: unitError } = await admin
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  if (unitError) {
    return {
      tenantIds: [] as string[],
      error: isMissingSchemaError(unitError)
        ? "This feature requires a database update."
        : "Failed to look up units for the selected properties."
    };
  }

  const unitIds = Array.from(
    new Set(
      (units ?? [])
        .map((unit) => unit.id)
        .filter((unitId): unitId is string => Boolean(unitId))
    )
  );

  if (unitIds.length === 0) {
    return { tenantIds: [] as string[], error: null };
  }

  const { data: leases, error: leaseError } = await admin
    .from("leases")
    .select("tenant_profile_id")
    .eq("active", true)
    .in("unit_id", unitIds);

  if (leaseError) {
    return {
      tenantIds: [] as string[],
      error: isMissingSchemaError(leaseError)
        ? "This feature requires a database update."
        : "Failed to look up tenants for the selected properties."
    };
  }

  return {
    tenantIds: Array.from(
      new Set(
        (leases ?? [])
          .map((lease) => lease.tenant_profile_id)
          .filter((tenantId): tenantId is string => Boolean(tenantId))
      )
    ),
    error: null
  };
}

export async function getEstimatedRecipientCount(
  scope: AnnouncementScope,
  propertyIds: string[] = []
): Promise<number> {
  const { user } = await requireAuth("owner", "manager");
  const admin = createAdminClient();

  const parsed = announcementTargetingSchema.safeParse({
    scope,
    propertyIds: normalizePropertyIds(propertyIds)
  });

  if (!parsed.success) {
    return 0;
  }

  const verifiedProperties = await resolveVerifiedAnnouncementPropertyIds(user.id, parsed.data, admin);
  if (!verifiedProperties.success || verifiedProperties.propertyIds.length === 0) {
    return 0;
  }

  const tenantLookup = await getTargetTenantIdsForProperties(verifiedProperties.propertyIds, admin);
  if (tenantLookup.error) {
    throw new Error(tenantLookup.error);
  }

  return tenantLookup.tenantIds.length;
}

export async function createAnnouncement(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const admin = createAdminClient();

  if (!checkRateLimit(`announcement:${user.id}`, 10, 60 * 60 * 1000).allowed) {
    return {
      success: false,
      error: "Too many announcements. Please wait an hour."
    };
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const rawTitle = formData.get("title");
  const rawBody = formData.get("body");
  const parsed = createAnnouncementSchema.safeParse({
    scope: formData.get("scope"),
    propertyIds: normalizePropertyIds(
      formData
        .getAll("propertyIds")
        .filter((value): value is string => typeof value === "string")
    ),
    title: typeof rawTitle === "string" ? rawTitle.trim() : rawTitle,
    body: typeof rawBody === "string" ? rawBody.trim() : rawBody
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid announcement data."
    };
  }

  const verifiedProperties = await resolveVerifiedAnnouncementPropertyIds(user.id, parsed.data, admin);
  if (!verifiedProperties.success) {
    return {
      success: false,
      error: verifiedProperties.error
    };
  }

  if (verifiedProperties.propertyIds.length === 0) {
    return {
      success: false,
      error: "No properties to send to."
    };
  }

  const tenantLookup = await getTargetTenantIdsForProperties(verifiedProperties.propertyIds, admin);
  if (tenantLookup.error) {
    return {
      success: false,
      error: tenantLookup.error
    };
  }

  if (tenantLookup.tenantIds.length === 0) {
    return {
      success: false,
      error: "No active tenants in the selected properties."
    };
  }

  const dedupeInput = [
    user.id,
    parsed.data.title,
    parsed.data.body,
    [...verifiedProperties.propertyIds].sort().join(","),
    Math.floor(Date.now() / (5 * 60 * 1000)).toString()
  ].join("|");
  const dedupeKey = hashString(dedupeInput);

  const { data: announcement, error: insertError } = await admin
    .from("announcements")
    .insert({
      sender_profile_id: user.id,
      scope: parsed.data.scope,
      property_ids:
        parsed.data.scope === "specific_properties" ? verifiedProperties.propertyIds : null,
      title: parsed.data.title,
      body: parsed.data.body,
      recipient_count: tenantLookup.tenantIds.length,
      dedupe_key: dedupeKey
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: true, message: "This announcement was already sent." };
    }

    if (isMissingSchemaError(insertError)) {
      return {
        success: false,
        error: "This feature requires a database update."
      };
    }

    console.error("[announcements] insert failed:", insertError);
    return {
      success: false,
      error: "Failed to create announcement."
    };
  }

  const { data: tenantProfiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, role")
    .in("id", tenantLookup.tenantIds);

  if (profileError) {
    console.error("[announcements] tenant profile lookup failed:", profileError);
    return {
      success: false,
      error: isMissingSchemaError(profileError)
        ? "This feature requires a database update."
        : "Failed to load tenant contact details."
    };
  }

  const tenantProfileById = new Map(
    (tenantProfiles ?? []).map((profile) => [profile.id, profile])
  );

  const deliveryResults = await Promise.allSettled(
    tenantLookup.tenantIds.map((tenantId) => {
      const tenantProfile = tenantProfileById.get(tenantId);
      const recipientRole: NotificationRecipientRole =
        tenantProfile?.role === "owner" ||
        tenantProfile?.role === "manager" ||
        tenantProfile?.role === "tenant"
          ? tenantProfile.role
          : "tenant";

      return createNotificationWithDelivery({
        recipientProfileId: tenantId,
        recipientEmail: tenantProfile?.email ?? null,
        recipientRole,
        type: ANNOUNCEMENT_NOTIFICATION_TYPE,
        title: parsed.data.title,
        body: parsed.data.body,
        entityType: ANNOUNCEMENT_ENTITY_TYPE,
        entityId: announcement.id
      });
    })
  );

  const failedDeliveries = deliveryResults.filter((result) => result.status === "rejected").length;
  if (failedDeliveries > 0) {
    console.warn(
      `[announcements] ${failedDeliveries}/${tenantLookup.tenantIds.length} deliveries failed for announcement ${announcement.id}`
    );
  }

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");

  return {
    success: true,
    message: `Announcement sent to ${tenantLookup.tenantIds.length} tenant${tenantLookup.tenantIds.length === 1 ? "" : "s"}.`
  };
}
