"use server";

import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/rate-limit";
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

  const { allowed } = checkRateLimit(`login:${email}`, 5, 900_000);
  if (!allowed) {
    return {
      error: "Too many sign-in attempts. Wait 15 minutes or reset your password.",
      blocked: true
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapAuthErrorMessage(error.message) };
  }

  redirect("/");
}
