export function notificationsEnabled(): boolean {
  return process.env.DOMUS_NOTIFICATIONS_ENABLED === "true";
}
