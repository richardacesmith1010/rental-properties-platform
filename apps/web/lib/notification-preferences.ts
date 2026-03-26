import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/lib/notifications";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const NOTIFICATION_EMAIL_PREFERENCE_KEYS = [
  "rent_due_reminder",
  "late_rent",
  "payment_received",
  "maintenance_updates",
  "lease_expiration",
  "delinquency_escalation",
  "manager_invoice"
] as const;

export const NOTIFICATION_PAUSE_DURATIONS = [
  "24_hours",
  "1_week",
  "until_resumed"
] as const;

export type NotificationEmailPreferenceKey =
  (typeof NOTIFICATION_EMAIL_PREFERENCE_KEYS)[number];
export type NotificationPauseDuration = (typeof NOTIFICATION_PAUSE_DURATIONS)[number];

export type NotificationEmailPreferences = Record<
  NotificationEmailPreferenceKey,
  boolean
>;

export interface NotificationPreferenceOption {
  key: NotificationEmailPreferenceKey;
  label: string;
  description: string;
}

export interface NotificationPreferenceSettings {
  preferences: NotificationEmailPreferences;
  pausedUntil: string | null;
  schemaReady: boolean;
}

export interface NotificationPreference {
  notificationType: NotificationType;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  emailBlockReason?: string | null;
}

export interface NotificationDeliveryPreference {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  emailBlockReason?: string | null;
}

export const DEFAULT_NOTIFICATION_EMAIL_PREFERENCES: NotificationEmailPreferences =
  {
    rent_due_reminder: true,
    late_rent: true,
    payment_received: true,
    maintenance_updates: true,
    lease_expiration: true,
    delinquency_escalation: true,
    manager_invoice: true
  };

export const NOTIFICATION_EMAIL_PREFERENCE_OPTIONS: NotificationPreferenceOption[] =
  [
    {
      key: "rent_due_reminder",
      label: "Rent due reminders",
      description: "Send reminder emails three days before rent is due."
    },
    {
      key: "late_rent",
      label: "Late rent alerts",
      description: "Send emails when a rent charge becomes overdue."
    },
    {
      key: "payment_received",
      label: "Payment received",
      description: "Send confirmation emails when tenant payments are recorded."
    },
    {
      key: "maintenance_updates",
      label: "Maintenance ticket updates",
      description: "Send emails for new tickets and maintenance status changes."
    },
    {
      key: "lease_expiration",
      label: "Lease expiration warnings",
      description: "Send 30-day lease expiration and expiry notice emails."
    },
    {
      key: "delinquency_escalation",
      label: "Overdue rent follow-ups",
      description: "Send repeat emails when rent stays unpaid."
    },
    {
      key: "manager_invoice",
      label: "Manager payment invoices",
      description: "Send manager invoice emails when manager payments are recorded."
    }
  ];

const PAUSE_UNTIL_RESUMED_ISO = "9999-12-31T23:59:59.000Z";
const preferenceKeySet = new Set<string>(NOTIFICATION_EMAIL_PREFERENCE_KEYS);

function createDefaultSettings(schemaReady = true): NotificationPreferenceSettings {
  return {
    preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
    pausedUntil: null,
    schemaReady
  };
}

function normalizePauseTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function normalizeNotificationEmailPreferences(
  value: unknown
): NotificationEmailPreferences {
  const normalized = { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const key of NOTIFICATION_EMAIL_PREFERENCE_KEYS) {
    const rawValue = (value as Record<string, unknown>)[key];
    if (typeof rawValue === "boolean") {
      normalized[key] = rawValue;
    }
  }

  return normalized;
}

export function areNotificationEmailsPaused(
  pausedUntil: string | null | undefined,
  now = Date.now()
): boolean {
  if (!pausedUntil) {
    return false;
  }

  const pausedUntilMs = new Date(pausedUntil).getTime();
  if (Number.isNaN(pausedUntilMs)) {
    return false;
  }

  return pausedUntilMs > now;
}

export function resolveNotificationPauseUntil(
  duration: NotificationPauseDuration,
  now = new Date()
): string {
  if (duration === "until_resumed") {
    return PAUSE_UNTIL_RESUMED_ISO;
  }

  const next = new Date(now);
  if (duration === "24_hours") {
    next.setHours(next.getHours() + 24);
    return next.toISOString();
  }

  next.setDate(next.getDate() + 7);
  return next.toISOString();
}

export function formatNotificationsPausedLabel(
  pausedUntil: string | null | undefined
): string | null {
  const normalized = normalizePauseTimestamp(pausedUntil);
  if (!normalized || !areNotificationEmailsPaused(normalized)) {
    return null;
  }

  if (normalized === PAUSE_UNTIL_RESUMED_ISO) {
    return "until you resume them";
  }

  return `until ${new Date(normalized).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  })}`;
}

export function getNotificationPreferenceKeyForType(
  type: NotificationType
): NotificationEmailPreferenceKey | null {
  switch (type) {
    case "rent_due_reminder":
      return "rent_due_reminder";
    case "late_rent":
      return "late_rent";
    case "payment_recorded":
      return "payment_received";
    case "new_ticket":
    case "ticket_resolved":
      return "maintenance_updates";
    case "lease_expiring_soon":
    case "lease_expired":
      return "lease_expiration";
    case "delinquency_escalation":
      return "delinquency_escalation";
    default:
      return null;
  }
}

export function resolveNotificationPreferenceKey(
  typeOrKey: NotificationType | NotificationEmailPreferenceKey | null
): NotificationEmailPreferenceKey | null {
  if (!typeOrKey) {
    return null;
  }

  if (preferenceKeySet.has(typeOrKey)) {
    return typeOrKey as NotificationEmailPreferenceKey;
  }

  return getNotificationPreferenceKeyForType(typeOrKey as NotificationType);
}

export function resolveNotificationDeliveryPreference(
  settings: NotificationPreferenceSettings,
  typeOrKey: NotificationType | NotificationEmailPreferenceKey | null
): NotificationDeliveryPreference {
  const normalizedPause = normalizePauseTimestamp(settings.pausedUntil);
  if (areNotificationEmailsPaused(normalizedPause)) {
    return {
      emailEnabled: false,
      inAppEnabled: true,
      emailBlockReason:
        normalizedPause === PAUSE_UNTIL_RESUMED_ISO
          ? "email notifications are paused until resumed"
          : `email notifications are paused until ${new Date(normalizedPause!).toISOString()}`
    };
  }

  const preferenceKey = resolveNotificationPreferenceKey(typeOrKey);
  if (preferenceKey && settings.preferences[preferenceKey] === false) {
    return {
      emailEnabled: false,
      inAppEnabled: true,
      emailBlockReason: `${preferenceKey} emails are disabled`
    };
  }

  return {
    emailEnabled: true,
    inAppEnabled: true,
    emailBlockReason: null
  };
}

export function resolveCombinedNotificationDeliveryPreference(
  settingsList: NotificationPreferenceSettings[],
  typeOrKey: NotificationType | NotificationEmailPreferenceKey | null
): NotificationDeliveryPreference {
  if (settingsList.length === 0) {
    return {
      emailEnabled: true,
      inAppEnabled: true,
      emailBlockReason: null
    };
  }

  for (const settings of settingsList) {
    const resolved = resolveNotificationDeliveryPreference(settings, typeOrKey);
    if (!resolved.emailEnabled) {
      return resolved;
    }
  }

  return {
    emailEnabled: true,
    inAppEnabled: true,
    emailBlockReason: null
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
