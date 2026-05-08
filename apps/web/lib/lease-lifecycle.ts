import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUnitLabel } from "@/lib/format";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import {
  getPropertyNotificationDeliveryPreferences
} from "@/lib/notification-preferences";

export async function detectExpiredLeases(supabase: SupabaseClient): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, end_date, lease_status, active")
    .lt("end_date", todayIso);
  if (leaseError) {
    throw leaseError;
  }

  const candidates = ((leases ?? []) as Array<{
    id: string;
    unit_id: string;
    tenant_profile_id: string | null;
    end_date: string;
    lease_status: string | null;
    active: boolean;
  }>).filter((lease) => !["terminated", "renewed"].includes(lease.lease_status ?? "active"));

  if (candidates.length === 0) {
    return "Expired leases detected: 0.";
  }

  const leaseIdsToExpire = candidates
    .filter((lease) => lease.active || (lease.lease_status ?? "active") !== "expired")
    .map((lease) => lease.id);
  if (leaseIdsToExpire.length > 0) {
    const { error: expireError } = await supabase
      .from("leases")
      .update({ lease_status: "expired", active: false })
      .in("id", leaseIdsToExpire);
    if (expireError) {
      throw expireError;
    }
  }

  const unitIds = Array.from(new Set(candidates.map((lease) => lease.unit_id)));
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .in("id", unitIds);
  if (unitsError) {
    throw unitsError;
  }

  const unitRows = (units ?? []) as Array<{ id: string; property_id: string; unit_number: string }>;
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);
  if (propertiesError) {
    throw propertiesError;
  }

  const tenantIds = Array.from(
    new Set(candidates.map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles").select("id, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const propertyById = new Map(((properties ?? []) as Array<{ id: string; name: string }>).map((property) => [property.id, property]));
  const profileById = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile]));
  const deliveryByPropertyId = await getPropertyNotificationDeliveryPreferences(
    supabase,
    propertyIds,
    "lease_expired"
  );

  await Promise.all(
    candidates.flatMap((lease) => {
      const unit = unitById.get(lease.unit_id);
      const property = unit ? propertyById.get(unit.property_id) : null;
      const tenantProfile = lease.tenant_profile_id ? profileById.get(lease.tenant_profile_id) ?? null : null;
      const notifications: Promise<unknown>[] = [];

      if (lease.tenant_profile_id) {
        notifications.push(
          createNotificationWithDelivery({
            recipientProfileId: lease.tenant_profile_id,
            recipientEmail: tenantProfile?.email ?? null,
            type: "lease_expired",
            title: "Lease Expired",
            body: `Your lease for ${formatUnitLabel(unit?.unit_number ?? "?")} at ${property?.name ?? "your property"} has expired.`,
            entityType: "lease",
            entityId: lease.id,
            deliveryPreference: unit?.property_id
              ? deliveryByPropertyId.get(unit.property_id)
              : undefined
          })
        );
      }

      if (unit?.property_id) {
        notifications.push(
          notifyOwnerMembersForProperty({
            propertyId: unit.property_id,
            type: "lease_expired",
            title: "Lease Expired",
            body: `Lease for ${tenantProfile?.email ?? "tenant"} at ${formatUnitLabel(unit.unit_number)} has expired.`,
            entityType: "lease",
            entityId: lease.id
          })
        );
      }

      return notifications;
    })
  );

  return `Expired leases detected: ${candidates.length}.`;
}

export async function sendLeaseExpirationWarnings(supabase: SupabaseClient): Promise<string> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const warningDate = new Date(today);
  warningDate.setUTCDate(warningDate.getUTCDate() + 30);
  const warningIso = warningDate.toISOString().slice(0, 10);
  const recentThreshold = new Date(today);
  recentThreshold.setUTCDate(recentThreshold.getUTCDate() - 30);

  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, end_date, lease_status, active")
    .eq("active", true)
    .gte("end_date", todayIso)
    .lte("end_date", warningIso);
  if (leaseError) {
    throw leaseError;
  }

  const candidates = ((leases ?? []) as Array<{
    id: string;
    unit_id: string;
    tenant_profile_id: string | null;
    end_date: string;
    lease_status: string | null;
    active: boolean;
  }>).filter((lease) => !["terminated", "renewed", "expired"].includes(lease.lease_status ?? "active"));

  if (candidates.length === 0) {
    return "Expiration warnings sent: 0.";
  }

  const candidateIds = candidates.map((lease) => lease.id);
  const { data: existingWarnings, error: existingWarningsError } = await supabase
    .from("notifications")
    .select("entity_id")
    .eq("type", "lease_expiring_soon")
    .eq("entity_type", "lease")
    .in("entity_id", candidateIds)
    .gte("created_at", recentThreshold.toISOString());
  if (existingWarningsError) {
    throw existingWarningsError;
  }

  const alreadyWarned = new Set(
    ((existingWarnings ?? []) as Array<{ entity_id: string | null }>).map((row) => row.entity_id).filter(
      (entityId): entityId is string => Boolean(entityId)
    )
  );

  const unitIds = Array.from(new Set(candidates.map((lease) => lease.unit_id)));
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .in("id", unitIds);
  if (unitsError) {
    throw unitsError;
  }

  const unitRows = (units ?? []) as Array<{ id: string; property_id: string; unit_number: string }>;
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);
  if (propertiesError) {
    throw propertiesError;
  }

  const tenantIds = Array.from(
    new Set(candidates.map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles").select("id, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const propertyById = new Map(((properties ?? []) as Array<{ id: string; name: string }>).map((property) => [property.id, property]));
  const profileById = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile]));
  const deliveryByPropertyId = await getPropertyNotificationDeliveryPreferences(
    supabase,
    propertyIds,
    "lease_expiring_soon"
  );

  const pendingNotifications = candidates
    .filter((lease) => lease.tenant_profile_id && !alreadyWarned.has(lease.id))
    .map((lease) => {
      const unit = unitById.get(lease.unit_id);
      const property = unit ? propertyById.get(unit.property_id) : null;
      const tenantProfile = profileById.get(lease.tenant_profile_id as string);
      return createNotificationWithDelivery({
        recipientProfileId: lease.tenant_profile_id as string,
        recipientEmail: tenantProfile?.email ?? null,
        type: "lease_expiring_soon",
        title: "Lease Expiring Soon",
        body: `Your lease for ${formatUnitLabel(unit?.unit_number ?? "?")} at ${property?.name ?? "your property"} expires on ${lease.end_date}. Contact your landlord about renewal.`,
        entityType: "lease",
        entityId: lease.id,
        deliveryPreference: unit?.property_id
          ? deliveryByPropertyId.get(unit.property_id)
          : undefined
      });
    });

  await Promise.all(pendingNotifications);
  return `Expiration warnings sent: ${pendingNotifications.length}.`;
}
