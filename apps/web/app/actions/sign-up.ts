"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { validatePassword, mapAuthErrorMessage } from "@/lib/password-validation";
import { agreementClient, legalRecordFailure, recordLegalAcceptance, versionsMatch } from "@/lib/legal-acceptance";

export interface SignUpState { success: boolean; error?: string; email?: string }
export async function signUpAction(_prev: SignUpState | null, formData: FormData): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = checkRateLimit(`signUp:ip:${ip}`, 10, 60_000);
  const emailLimit = checkRateLimit(`signUp:email:${email}`, 3, 60_000);
  if (!ipLimit.allowed || !emailLimit.allowed) return { success: false, error: "Too many tries. Please wait a minute." };
  if (!z.email().safeParse(email).success) return { success: false, error: "Enter a valid email address." };
  const password = String(formData.get("password") ?? "");
  const strength = validatePassword(password);
  if (!strength.isValid) return { success: false,
    error: strength.errors[0] ?? "Use at least 8 characters with a capital letter and a number." };
  if (password !== formData.get("confirmPassword")) return { success: false, error: "Passwords do not match yet." };
  if (formData.get("agree") !== "yes") return { success: false, error: "Check the box to agree first." };
  if (!versionsMatch(formData.get("termsVersion"), formData.get("privacyVersion"))) {
    return { success: false, error: "We just updated the Terms. Reload the page to read them." };
  }
  const postedRole = String(formData.get("role"));
  const role = ["owner", "manager", "tenant"].includes(postedRole) ? postedRole : "owner";
  const { data, error } = await createClient().auth.signUp({ email, password, options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/auth/callback?next=${encodeURIComponent(`/${role}`)}`,
    data: { role }
  } });
  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) return { success: true, email };
    return { success: false, error: mapAuthErrorMessage(error.message) };
  }
  const user = data.user;
  if (user?.identities?.length && Date.parse(user.created_at) >= Date.now() - 120_000) {
    if (!user.email) legalRecordFailure("sign_up", "no_email");
    else if (user.email.toLowerCase() !== email) legalRecordFailure("sign_up", "email_mismatch");
    else {
      try {
        await recordLegalAcceptance(createAdminClient(), {
          profileId: user.id, email: user.email, source: "sign_up", client: await agreementClient()
        });
      } catch { legalRecordFailure("sign_up", "write_failed"); }
    }
  }
  return { success: true, email };
}
