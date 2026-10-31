import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isNativeAppServer } from "@/lib/native-app-server";
import { getAuthState, getRoleHomePath } from "@/lib/auth";
import { getSafeNextPath, isNextAllowedForRole, resolveAuthRoute } from "@/lib/route-resolver";
import { AGREEMENT_REQUIRED_FROM, LEGAL_DOCUMENTS, LEGAL_RECORD_HMAC_KEY_VERSION } from "@/lib/legal-versions";

export interface LegalAcceptanceRow { profile_id: string; terms_version: string; privacy_version: string }
export async function readOwnLegalAcceptances(supabase: SupabaseClient): Promise<LegalAcceptanceRow[]> {
  const { data, error } = await supabase.from("legal_acceptances").select("profile_id, terms_version, privacy_version");
  if (error) throw new Error("Unable to read agreement records.");
  return data ?? [];
}
export function versionsMatch(terms: unknown, privacy: unknown) {
  return terms === LEGAL_DOCUMENTS.terms.current && privacy === LEGAL_DOCUMENTS.privacy.current;
}
export function legalStatus(userId: string, rows: LegalAcceptanceRow[]) {
  const own = rows.filter((row) => row.profile_id === userId);
  return {
    accepted: own.some((row) => versionsMatch(row.terms_version, row.privacy_version)),
    hasEarlier: own.some((row) => !versionsMatch(row.terms_version, row.privacy_version))
  };
}
export function agreementRequired(user: Pick<User, "created_at">) {
  return Date.parse(user.created_at) >= Date.parse(AGREEMENT_REQUIRED_FROM);
}
export async function checkAgreement(supabase: SupabaseClient, user: Pick<User, "id" | "created_at">) {
  if (!agreementRequired(user)) return "exempt";
  return legalStatus(user.id, await readOwnLegalAcceptances(supabase)).accepted ? "accepted" : "required";
}
export async function agreementClient(): Promise<"ios_app" | "web"> {
  return await isNativeAppServer() ? "ios_app" : "web";
}
export function legalRecordFailure(source: string, code: string): { ok: false; code: string } {
  console.error("[legal] acceptance not saved", { source, code });
  return { ok: false, code };
}
// Attribution: sign_up is the request that created this login; Auth later confirms email ownership for the same id.
// llc_invite is registration through an emailed one-time token bound to that email.
// invite and agree_page use a signed-in session; an invite session comes from its emailed link.
// role_at_acceptance is a snapshot of profiles.role, never authorization. client is user-agent-reported, not device proof.
// No name, email or phone is stored. Anonymize profiles on closure; never delete them. Retain for 10 years after closure,
// then use a reviewed, owner-approved purge. Active legal holds exclude profiles from that purge.
export async function recordLegalAcceptance(admin: SupabaseClient, input: {
  profileId: string; email?: string | null; source: "sign_up" | "invite" | "llc_invite" | "agree_page";
  client: "web" | "ios_app";
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const fail = (code: string) => legalRecordFailure(input.source, code);
  const key = process.env.LEGAL_RECORD_HMAC_KEY;
  if (!input.email?.trim()) return fail("no_email");
  if (!key) return fail("no_hmac_key");
  try {
    const { data: profile, error: profileError } = await admin.from("profiles").select("role")
      .eq("id", input.profileId).maybeSingle();
    if (profileError) return fail("profile_read");
    if (!profile || !["owner", "manager", "tenant"].includes(profile.role)) return fail("no_profile");
    const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
    const terms = LEGAL_DOCUMENTS.terms;
    const privacy = LEGAL_DOCUMENTS.privacy;
    const { error } = await admin.from("legal_acceptances").upsert({
      profile_id: input.profileId, terms_version: terms.current, terms_sha256: terms.versions[terms.current],
      privacy_version: privacy.current, privacy_sha256: privacy.versions[privacy.current], source: input.source,
      role_at_acceptance: profile.role, client: input.client,
      email_hmac: createHmac("sha256", key).update(input.email.trim().toLowerCase()).digest("hex"),
      email_hmac_key_version: LEGAL_RECORD_HMAC_KEY_VERSION,
      app_commit: /^[0-9a-f]{7,40}$/.test(commit) ? commit : null
    }, { onConflict: "profile_id,terms_version,privacy_version", ignoreDuplicates: true });
    return error ? fail("write_failed") : { ok: true };
  } catch {
    return fail("write_failed");
  }
}
export async function agreeDestination(user: Pick<User, "id">, rawNext: unknown) {
  const state = await getAuthState(user.id);
  const destination = resolveAuthRoute({ hasSession: true, ...state });
  const next = getSafeNextPath(rawNext);
  return state.role && destination === getRoleHomePath(state.role) && next && isNextAllowedForRole(next, state.role)
    ? next : destination;
}
export async function agreementApiResponse(supabase: SupabaseClient, user: Pick<User, "id" | "created_at">) {
  return await checkAgreement(supabase, user) !== "required" ? null : NextResponse.json({
    error: "Please agree to the Terms first."
  }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
