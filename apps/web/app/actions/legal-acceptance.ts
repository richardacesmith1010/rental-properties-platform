"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireAuthForExit } from "@/app/actions/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { agreementClient, agreeDestination, recordLegalAcceptance, versionsMatch } from "@/lib/legal-acceptance";

export interface AgreementState { success: boolean; error?: string }
const saveError = "We could not save this. Please try again.";
function validateAgreement(agreed: boolean, terms: unknown, privacy: unknown) {
  if (!agreed) return "Check the box to agree first.";
  if (!versionsMatch(terms, privacy)) return "We just updated the Terms. Reload the page to read them.";
}
export async function agreeToTerms(_prev: AgreementState | null, formData: FormData): Promise<AgreementState> {
  const { user } = await requireAuthForExit("owner", "manager", "tenant");
  if (!checkRateLimit(`agreeToTerms:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many tries. Please wait a minute." };
  }
  const error = validateAgreement(formData.get("agree") === "yes", formData.get("termsVersion"), formData.get("privacyVersion"));
  if (error) return { success: false, error };
  try {
    const saved = await recordLegalAcceptance(createAdminClient(), {
      profileId: user.id, email: user.email, source: "agree_page", client: await agreementClient()
    });
    if (!saved.ok) return { success: false, error: saveError };
    redirect(await agreeDestination(user, formData.get("next")));
  } catch (error) {
    unstable_rethrow(error);
    return { success: false, error: saveError };
  }
}
export async function recordInviteAgreement(input: {
  agreed: boolean; termsVersion: string; privacyVersion: string;
}): Promise<AgreementState> {
  const { user } = await requireAuthForExit("owner", "manager", "tenant");
  if (!checkRateLimit(`recordInviteAgreement:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many tries. Please wait a minute." };
  }
  const error = validateAgreement(input.agreed, input.termsVersion, input.privacyVersion);
  if (error) return { success: false, error };
  try {
    const saved = await recordLegalAcceptance(createAdminClient(), {
      profileId: user.id, email: user.email, source: "invite", client: await agreementClient()
    });
    return saved.ok ? { success: true } : { success: false, error: saveError };
  } catch (error) {
    unstable_rethrow(error);
    return { success: false, error: saveError };
  }
}
