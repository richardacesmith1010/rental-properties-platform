import { normalizePauseTimestamp } from "@/lib/notification-preference-time";
import type { NotificationType } from "@/lib/notifications";

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
      description: "Send emails when rent becomes overdue."
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


export {
  getUserNotificationPreferenceSettings,
  getUserNotificationPreferenceSettingsMap,
  getPropertyNotificationDeliveryPreferences,
  getNotificationPreference,
  updateNotificationEmailPreference,
  setNotificationEmailPause,
  updateNotificationPreference
} from "@/lib/notification-preference-store";
