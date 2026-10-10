export type NotificationMode = "off" | "test" | "on";

const warnedConfigurations = new Set<string>();
function warnOnce(message: string) {
  const key = `${message}:${process.env.DOMUS_NOTIFICATIONS_ALLOWLIST}:${process.env.DOMUS_NOTIFICATIONS_ENABLED}`;
  if (!warnedConfigurations.has(key)) {
    warnedConfigurations.add(key);
    console.warn(message);
  }
}

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,.]+(?:\.[^\s@,.]+)+$/;

export function notificationAllowlist(value = process.env.DOMUS_NOTIFICATIONS_ALLOWLIST): string[] {
  return Array.from(new Set((value ?? "").split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => EMAIL_PATTERN.test(entry))));
}

export function notificationMode(): NotificationMode {
  const configured = Boolean(process.env.DOMUS_NOTIFICATIONS_ALLOWLIST?.trim());
  if (configured) {
    if (notificationAllowlist().length === 0) {
      warnOnce("[notifications] allowlist invalid: off");
      return "off";
    }
    if (process.env.DOMUS_NOTIFICATIONS_ENABLED === "true") {
      warnOnce("[notifications] both set: using test mode");
    }
    return "test";
  }
  return process.env.DOMUS_NOTIFICATIONS_ENABLED === "true" ? "on" : "off";
}

export function isNotificationRecipientAllowed(
  mode: NotificationMode,
  canonicalEmail: string | null | undefined,
  list: readonly string[]
): boolean {
  if (mode === "off") return false;
  if (mode === "on") return true;
  return Boolean(canonicalEmail && list.includes(canonicalEmail.trim().toLowerCase()));
}

export function notificationsEnabled(): boolean {
  return notificationMode() !== "off";
}
