export interface AuthState {
  hasSession: boolean;
  hasProfile: boolean;
  onboardingComplete: boolean;
  role: "owner" | "manager" | "tenant" | null;
  needsPasswordSet: boolean;
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
