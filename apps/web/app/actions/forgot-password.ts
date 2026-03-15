"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "./shared";

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    return { success: false, error: "Email is required." };
  }

  const normalized = email.trim().toLowerCase();
  if (!checkRateLimit(`forgot-password:${normalized}`, 3, 15 * 60 * 1000).allowed) {
    return { success: false, error: "Too many requests. Please try again in 15 minutes." };
  }

  const supabase = createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: `${appUrl}/auth/callback?next=/reset-password`
    });
    if (error) {
      console.error("forgotPasswordAction reset error:", error);
    }
  } catch (error) {
    console.error("forgotPasswordAction unexpected error:", error);
  }

  return {
    success: true,
    message: "If an account exists with that email, a reset link has been sent."
  };
}
