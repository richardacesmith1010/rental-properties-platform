import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ signUp: vi.fn(), from: vi.fn(), upsert: vi.fn(), role: vi.fn(), native: vi.fn(), headers: vi.fn(),
  select: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { signUp: m.signUp } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from }) }));
vi.mock("@/lib/native-app-server", () => ({ isNativeAppServer: m.native }));
vi.mock("next/headers", () => ({ headers: m.headers }));
import * as legalEvidence from "@/lib/legal-acceptance";
import { signUpAction } from "../sign-up";
import { resetRateLimitState } from "@/lib/rate-limit";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";

function form(overrides: Record<string, string> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({ email: "Person@example.com", password: "Password123", confirmPassword: "Password123",
    role: "owner", agree: "yes", termsVersion: "2026-10-30", privacyVersion: "2026-10-30", ...overrides })) f.set(key, value);
  return f;
}
function authUser(overrides = {}) {
  return { id: "p", email: "person@example.com", created_at: new Date().toISOString(), identities: [{ id: "identity" }], ...overrides };
}
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState();
  vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "test-key"); vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef0");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://domusbase.com");
  m.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }));
  m.native.mockResolvedValue(false); m.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
  m.role.mockResolvedValue({ data: { role: "tenant" }, error: null }); m.upsert.mockResolvedValue({ error: null });
  m.from.mockImplementation((table: string) => table === "profiles"
    ? { select: m.select } : { upsert: m.upsert });
  m.select.mockReturnValue({ eq: m.eq }); m.eq.mockReturnValue({ maybeSingle: m.role });
});
describe("registration agreement", () => {
  it.each([
    ["S1", { agree: "" }, "Check the box to agree first."],
    ["S2", { termsVersion: "old" }, "We just updated the Terms. Reload the page to read them."],
    ["email", { email: "invalid" }, "Enter a valid email address."],
    ["password", { password: "" }, "Use at least 8 characters with a capital letter and a number."],
    ["confirm", { confirmPassword: "Mismatch123" }, "Passwords do not match yet."]
  ])("%s validates before Auth or DB", async (_id, overrides, error) => {
    expect(await signUpAction(null, form(overrides as Record<string, string>))).toEqual({ success: false, error });
    expect(m.signUp).not.toHaveBeenCalled(); expect(m.from).not.toHaveBeenCalled();
  });
  it("S3,S10,S15 exact Auth and evidence payload use the profile role and returned email", async () => {
    const recorder = vi.spyOn(legalEvidence, "recordLegalAcceptance");
    m.signUp.mockResolvedValue({ data: { user: authUser({ id: "returned-user", email: "PERSON@example.com" }) }, error: null });
    expect(await signUpAction(null, form())).toEqual({ success: true, email: "person@example.com" });
    expect(m.signUp.mock.calls).toEqual([[{ email: "person@example.com", password: "Password123", options: {
      emailRedirectTo: "https://domusbase.com/auth/callback?next=%2Fowner", data: { role: "owner" }
    } }]]);
    expect(recorder.mock.calls.map(([, input]) => input)).toEqual([{
      profileId: "returned-user", email: "PERSON@example.com", source: "sign_up", client: "web"
    }]);
    recorder.mockRestore();
    expect(m.from.mock.calls).toEqual([["profiles"], ["legal_acceptances"]]);
    expect(m.select.mock.calls).toEqual([["role"]]);
    expect(m.eq.mock.calls).toEqual([["id", "returned-user"]]);
    expect(m.upsert.mock.calls).toEqual([[{
      profile_id: "returned-user", terms_version: "2026-10-30", privacy_version: "2026-10-30",
      terms_sha256: LEGAL_DOCUMENTS.terms.versions["2026-10-30"], privacy_sha256: LEGAL_DOCUMENTS.privacy.versions["2026-10-30"],
      source: "sign_up", role_at_acceptance: "tenant", client: "web", email_hmac_key_version: 1,
      email_hmac: createHmac("sha256", "test-key").update("person@example.com").digest("hex"), app_commit: "abcdef0"
    }, { onConflict: "profile_id,terms_version,privacy_version", ignoreDuplicates: true }]]);
  });
  it("S12 forged role falls back to owner; evidence still uses profiles.role", async () => {
    await signUpAction(null, form({ role: "admin" }));
    expect(m.signUp.mock.calls[0][0].options.data).toEqual({ role: "owner" });
    expect(m.upsert.mock.calls[0][0].role_at_acceptance).toEqual("tenant");
  });
  it.each([
    ["S3b,S5", { created_at: new Date(Date.now() - 180_000).toISOString() }], ["S4", { identities: [] }],
    ["S13", { email: undefined }], ["S14", { email: "different@example.com" }]
  ])("%s succeeds without recording an unproven registration", async (_id, overrides) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.signUp.mockResolvedValue({ data: { user: authUser(overrides) }, error: null });
    expect(await signUpAction(null, form())).toEqual({ success: true, email: "person@example.com" });
    expect(m.upsert).not.toHaveBeenCalled();
    if (_id === "S13" || _id === "S14") expect(log.mock.calls).toEqual([["[legal] acceptance not saved",
      { source: "sign_up", code: _id === "S13" ? "no_email" : "email_mismatch" }]]);
    log.mockRestore();
  });
  it("S6 Auth failure maps copy and never records", async () => {
    m.signUp.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    expect(await signUpAction(null, form())).toEqual({ success: false,
      error: "Wrong email or password. Try again or reset your password." });
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it.each(["write", "key"])("S7,S11 %s failure leaves the check-email screen and logs once", async (failure) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "key") vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "");
    else m.upsert.mockResolvedValue({ error: { code: "failure" } });
    expect(await signUpAction(null, form())).toEqual({ success: true, email: "person@example.com" });
    if (failure === "key") expect(m.upsert).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([["[legal] acceptance not saved", { source: "sign_up",
      code: failure === "key" ? "no_hmac_key" : "write_failed" }]]); log.mockRestore();
  });
  it("S8 email and IP limits stop Auth calls", async () => {
    for (let i = 0; i < 3; i++) await signUpAction(null, form());
    m.signUp.mockClear();
    expect(await signUpAction(null, form())).toEqual({ success: false, error: "Too many tries. Please wait a minute." });
    expect(m.signUp).not.toHaveBeenCalled(); resetRateLimitState();
    for (let i = 0; i < 10; i++) await signUpAction(null, form({ email: `person${i}@example.com` }));
    m.signUp.mockClear();
    expect((await signUpAction(null, form({ email: "new@example.com" }))).error).toEqual("Too many tries. Please wait a minute.");
    expect(m.signUp).not.toHaveBeenCalled();
  });
  it("S9 native client is recorded", async () => {
    m.native.mockResolvedValue(true); await signUpAction(null, form());
    expect(m.upsert.mock.calls[0][0].client).toEqual("ios_app");
  });
  it("existing account errors stay indistinguishable", async () => {
    m.signUp.mockResolvedValue({ error: { code: "user_already_exists", message: "Already registered" } });
    expect(await signUpAction(null, form())).toEqual({ success: true, email: "person@example.com" });
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
