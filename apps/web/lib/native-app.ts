/**
 * Presentation/runtime detection only. Never use this as a security boundary:
 * it must not grant permissions, bypass CSRF/RLS, or change payment authorization.
 */
export function isNativeApp(userAgent?: string | null): boolean {
  const value = userAgent === undefined
    ? (typeof navigator === "undefined" ? "" : navigator.userAgent)
    : userAgent;
  return Boolean(value?.includes("DomusApp/"));
}
