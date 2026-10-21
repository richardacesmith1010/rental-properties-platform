export interface AuthState {
  hasSession: boolean;
  hasProfile: boolean;
  onboardingComplete: boolean;
  role: "owner" | "manager" | "tenant" | null;
  needsPasswordSet: boolean;
}

export type SafeNextPath = string & { readonly __brand: "SafeNextPath" };

const blockedPaths = [
  "/login", "/logout", "/auth", "/api", "/onboarding", "/complete-profile",
  "/reset-password", "/signup", "/_next", "/ops"
];

function isAtOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function getSafeNextPath(raw: unknown): SafeNextPath | null {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 512 || !/^[\x21-\x7e]+$/.test(raw)) {
    return null;
  }

  const withoutFragment = raw.split("#", 1)[0];
  const question = withoutFragment.indexOf("?");
  const rawPath = question < 0 ? withoutFragment : withoutFragment.slice(0, question);
  const rawQuery = question < 0 ? "" : withoutFragment.slice(question + 1);
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\")) {
    return null;
  }
  if (/%(?![0-9a-fA-F]{2})/.test(rawQuery)) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!/^[\x21-\x7e]+$/.test(decodedPath) || decodedPath.includes("%") || decodedPath.includes("\\") ||
      decodedPath.includes("//") || decodedPath.includes("?") || decodedPath.includes("#") ||
      decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  const url = new URL(decodedPath, "https://domus.invalid");
  if (url.origin !== "https://domus.invalid" || blockedPaths.some((prefix) => isAtOrUnder(url.pathname, prefix))) {
    return null;
  }
  return `${url.pathname}${rawQuery ? `?${rawQuery}` : ""}` as SafeNextPath;
}

export function isNextAllowedForRole(next: SafeNextPath, role: AuthState["role"]): boolean {
  if (!role) return false;
  const path = next.split("?", 1)[0];
  return isAtOrUnder(path, `/${role}`) || isAtOrUnder(path, "/settings") ||
    isAtOrUnder(path, "/payments/receipt");
}

export function buildConfirmCallbackUrl(tokenHash: string | null, type: string | null, rawNext: unknown): string | null {
  if (!tokenHash) return null;
  const params = new URLSearchParams();
  params.set("token_hash", tokenHash);
  if (type) params.set("type", type);
  const next = getSafeNextPath(rawNext);
  if (next && (type === "email" || type === "signup" || type === "magiclink")) params.set("next", next);
  return `/auth/callback?${params.toString()}`;
}

export function resolveAuthRoute(state: AuthState): string {
  if (!state.hasSession) {
    return "/login";
  }

  if (!state.hasProfile) {
    return "/onboarding";
  }

  if (state.needsPasswordSet) {
    return "/complete-profile";
  }

  if (!state.onboardingComplete) {
    return "/onboarding";
  }

  if (state.role === "owner") {
    return "/owner";
  }

  if (state.role === "manager") {
    return "/manager";
  }

  return "/tenant";
}
