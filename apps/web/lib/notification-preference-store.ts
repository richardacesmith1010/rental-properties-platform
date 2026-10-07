import { normalizePauseTimestamp } from "@/lib/notification-preference-time";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/lib/notifications";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  getNotificationPreferenceKeyForType,
  normalizeNotificationEmailPreferences,
  resolveCombinedNotificationDeliveryPreference,
  resolveNotificationDeliveryPreference,
  type NotificationDeliveryPreference,
  type NotificationEmailPreferenceKey,
  type NotificationPreference,
  type NotificationPreferenceSettings
} from "@/lib/notification-preferences";

function createDefaultSettings(schemaReady = true): NotificationPreferenceSettings {
  return {
    preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
    pausedUntil: null,
    schemaReady
  };
}


export async function getUserNotificationPreferenceSettings(
  userId: string
): Promise<NotificationPreferenceSettings> {
  const settingsByUserId = await getUserNotificationPreferenceSettingsMap([userId]);
  return settingsByUserId.get(userId) ?? createDefaultSettings(false);
}

export async function getUserNotificationPreferenceSettingsMap(
  userIds: string[]
): Promise<Map<string, NotificationPreferenceSettings>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const settingsByUserId = new Map<string, NotificationPreferenceSettings>();

  for (const userId of uniqueUserIds) {
    settingsByUserId.set(userId, createDefaultSettings());
  }

  if (uniqueUserIds.length === 0) {
    return settingsByUserId;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, notification_preferences, notifications_paused_until")
      .in("id", uniqueUserIds);

    if (error) {
      if (isMissingSchemaError(error)) {
        return new Map(
          uniqueUserIds.map((userId) => [userId, createDefaultSettings(false)])
        );
      }

      console.error("Failed to load notification preference settings:", error);
      return settingsByUserId;
    }

    for (const row of data ?? []) {
      settingsByUserId.set(row.id, {
        preferences: normalizeNotificationEmailPreferences(
          row.notification_preferences
        ),
        pausedUntil: normalizePauseTimestamp(row.notifications_paused_until),
        schemaReady: true
      });
    }

    return settingsByUserId;
  } catch (error) {
    console.error("Failed to load notification preference settings:", error);
    return settingsByUserId;
  }
}

export async function getPropertyNotificationDeliveryPreferences(
  supabase: Pick<SupabaseClient, "from">,
  propertyIds: string[],
  typeOrKey: NotificationType | NotificationEmailPreferenceKey | null
): Promise<Map<string, NotificationDeliveryPreference>> {
  const uniquePropertyIds = Array.from(new Set(propertyIds.filter(Boolean)));
  const deliveryByPropertyId = new Map<string, NotificationDeliveryPreference>();

  for (const propertyId of uniquePropertyIds) {
    deliveryByPropertyId.set(propertyId, {
      emailEnabled: true,
      inAppEnabled: true,
      emailBlockReason: null
    });
  }

  if (uniquePropertyIds.length === 0) {
    return deliveryByPropertyId;
  }

  let propertyRows: Array<{
    id: string;
    owner_account_id: string | null;
    owner_profile_id: string | null;
  }> = [];

  const propertyQuery = await supabase
    .from("properties")
    .select("id, owner_account_id, owner_profile_id")
    .in("id", uniquePropertyIds);

  if (propertyQuery.error) {
    if (isMissingSchemaError(propertyQuery.error)) {
      const fallbackQuery = await supabase
        .from("properties")
        .select("id, owner_profile_id")
        .in("id", uniquePropertyIds);

      if (fallbackQuery.error) {
        if (!isMissingSchemaError(fallbackQuery.error)) {
          console.error(
            "Failed to load fallback property notification ownership:",
            fallbackQuery.error
          );
        }
        return deliveryByPropertyId;
      }

      propertyRows = (fallbackQuery.data ?? []).map((property) => ({
        id: property.id,
        owner_account_id: null,
        owner_profile_id: property.owner_profile_id ?? null
      }));
    } else {
      console.error(
        "Failed to load property notification ownership:",
        propertyQuery.error
      );
      return deliveryByPropertyId;
    }
  } else {
    propertyRows = propertyQuery.data ?? [];
  }

  const ownerAccountIds = Array.from(
    new Set(
      propertyRows
        .map((property) => property.owner_account_id)
        .filter((accountId): accountId is string => Boolean(accountId))
    )
  );

  const ownerIdsByAccountId = new Map<string, string[]>();
  if (ownerAccountIds.length > 0) {
    const membersQuery = await supabase
      .from("ownership_account_members")
      .select("account_id, profile_id")
      .in("account_id", ownerAccountIds)
      .eq("member_role", "owner")
      .eq("active", true);

    if (membersQuery.error) {
      if (!isMissingSchemaError(membersQuery.error)) {
        console.error(
          "Failed to load account owners for notification preferences:",
          membersQuery.error
        );
      }
    } else {
      for (const row of membersQuery.data ?? []) {
        const accountOwnerIds = ownerIdsByAccountId.get(row.account_id) ?? [];
        accountOwnerIds.push(row.profile_id);
        ownerIdsByAccountId.set(row.account_id, accountOwnerIds);
      }
    }
  }

  const ownerProfileIds = Array.from(
    new Set(
      propertyRows.flatMap((property) => {
        const accountOwnerIds = property.owner_account_id
          ? ownerIdsByAccountId.get(property.owner_account_id) ?? []
          : [];

        if (accountOwnerIds.length > 0) {
          return accountOwnerIds;
        }

        return property.owner_profile_id ? [property.owner_profile_id] : [];
      })
    )
  );

  const settingsByUserId =
    ownerProfileIds.length > 0
      ? await getUserNotificationPreferenceSettingsMap(ownerProfileIds)
      : new Map<string, NotificationPreferenceSettings>();

  for (const property of propertyRows) {
    const accountOwnerIds = property.owner_account_id
      ? ownerIdsByAccountId.get(property.owner_account_id) ?? []
      : [];
    const controllingOwnerIds =
      accountOwnerIds.length > 0
        ? accountOwnerIds
        : property.owner_profile_id
          ? [property.owner_profile_id]
          : [];

    const settingsList = controllingOwnerIds.map(
      (userId) => settingsByUserId.get(userId) ?? createDefaultSettings(false)
    );

    deliveryByPropertyId.set(
      property.id,
      resolveCombinedNotificationDeliveryPreference(settingsList, typeOrKey)
    );
  }

  return deliveryByPropertyId;
}

export async function getNotificationPreference(
  userId: string,
  type: NotificationType
): Promise<NotificationPreference> {
  const settings = await getUserNotificationPreferenceSettings(userId);
  const resolved = resolveNotificationDeliveryPreference(settings, type);

  return {
    notificationType: type,
    emailEnabled: resolved.emailEnabled,
    inAppEnabled: resolved.inAppEnabled,
    emailBlockReason: resolved.emailBlockReason
  };
}

export async function updateNotificationEmailPreference(
  userId: string,
  preferenceKey: NotificationEmailPreferenceKey,
  enabled: boolean
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("notification_preferences")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  const nextPreferences = normalizeNotificationEmailPreferences(
    data?.notification_preferences
  );
  nextPreferences[preferenceKey] = enabled;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ notification_preferences: nextPreferences })
    .eq("id", userId);

  if (updateError) {
    throw updateError;
  }
}

export async function setNotificationEmailPause(
  userId: string,
  pausedUntil: string | null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ notifications_paused_until: pausedUntil })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function updateNotificationPreference(
  userId: string,
  type: NotificationType,
  emailEnabled: boolean,
  _inAppEnabled: boolean
): Promise<void> {
  const preferenceKey = getNotificationPreferenceKeyForType(type);
  if (!preferenceKey) {
    return;
  }

  await updateNotificationEmailPreference(userId, preferenceKey, emailEnabled);
}
