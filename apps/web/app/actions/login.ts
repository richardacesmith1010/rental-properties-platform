"use server";

import { redirect } from "next/navigation";
import {
  completeFailureAttempt,
  reserveFailureAttempt
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { mapAuthErrorMessage } from "@/lib/password-validation";

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

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      outcome = error.code === "invalid_credentials" ? "rejected" : "errored";
      return { error: mapAuthErrorMessage(error.message) };
    }

    outcome = "succeeded";
  } finally {
    completeFailureAttempt(result.reservation, outcome);
  }

  redirect("/");
}
