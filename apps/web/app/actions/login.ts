"use server";

import { redirect } from "next/navigation";
import {
  completeFailureAttempt,
  reserveFailureAttempt
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { mapAuthErrorMessage } from "@/lib/password-validation";
import { getAuthState, getRoleHomePath } from "@/lib/auth";
import { getSafeNextPath, isNextAllowedForRole, resolveAuthRoute } from "@/lib/route-resolver";

export interface LoginActionState {
  error?: string;
  blocked?: boolean;
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const nextValues = formData.getAll("next");
  const next = nextValues.length === 1 ? getSafeNextPath(nextValues[0]) : null;

  if (typeof rawEmail !== "string" || typeof rawPassword !== "string") {
    return { error: "Enter your email and password." };
  }

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (email.length === 0 || password.length === 0) {
    return { error: "Enter your email and password." };
  }

  const result = reserveFailureAttempt(`login:${email}`, 5, 900_000);
  if (!result.allowed) {
    return {
      error: "Too many sign-in attempts. Wait 15 minutes or reset your password.",
      blocked: true
    };
  }

  let outcome: "rejected" | "succeeded" | "errored" = "errored";
  let destination = "/";

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      outcome = error.code === "invalid_credentials" ? "rejected" : "errored";
      return { error: mapAuthErrorMessage(error.message) };
    }

    if (next) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const authState = await getAuthState(user.id, { invitedAt: user.invited_at ?? null });
        const stateDestination = resolveAuthRoute({ hasSession: true, ...authState });
        if (authState.role && stateDestination === getRoleHomePath(authState.role) &&
            isNextAllowedForRole(next, authState.role)) {
          destination = next;
        }
      }
    }

    outcome = "succeeded";
  } finally {
    completeFailureAttempt(result.reservation, outcome);
  }

  redirect(destination);
}
