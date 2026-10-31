import { createHmac } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ state: vi.fn(), native: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthState: mocks.state, getRoleHomePath: (role: string) => `/${role}` }));
vi.mock("@/lib/native-app-server", () => ({ isNativeAppServer: mocks.native }));
import { agreementClient, agreementRequired, agreeDestination, checkAgreement, legalStatus,
  recordLegalAcceptance, versionsMatch, agreementApiResponse } from "@/lib/legal-acceptance";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";

function db() {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { role: "manager" }, error: null });
  query.upsert.mockResolvedValue({ error: null });
  const from = vi.fn(() => query);
  return { from, query, client: { from } as unknown as SupabaseClient };
}
const current = { profile_id: "p", terms_version: "2026-10-30", privacy_version: "2026-10-30" };
const user = { id: "p", created_at: "2026-10-30T12:00:00Z" } as User;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "test-key"); vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef0");
  mocks.native.mockResolvedValue(false);
  mocks.state.mockResolvedValue({ hasProfile: true, onboardingComplete: true, role: "manager", needsPasswordSet: false });
});
describe("legal evidence", () => {
  it("G1,G5,G9 legal status uses own versions, never role", () => {
    expect(legalStatus("p", [current])).toEqual({ accepted: true, hasEarlier: false });
    expect(legalStatus("other", [current])).toEqual({ accepted: false, hasEarlier: false });
    expect(legalStatus("p", [{ ...current, terms_version: "old" }])).toEqual({ accepted: false, hasEarlier: true });
    expect(versionsMatch("2026-10-30", "old")).toBe(false);
  });
  it("G4 old accounts never read, including when a read would fail; cutoff is inclusive", async () => {
    const { client, from } = db();
    expect(await checkAgreement(client, { ...user, created_at: "2026-10-29T23:59:59Z" })).toEqual("exempt");
    expect(from).not.toHaveBeenCalled();
    expect(agreementRequired({ created_at: "2026-10-30T00:00:00.000Z" })).toBe(true);
  });
  it("G8 required read errors throw", async () => {
    const { client, query } = db(); query.select.mockResolvedValue({ error: { code: "failed" }, data: null });
    await expect(checkAgreement(client, user)).rejects.toThrow("Unable to read agreement records.");
  });
  it("G12 API required -> 403/no-store; accepted and exempt -> null", async () => {
    const { client, query } = db(); query.select.mockResolvedValue({ data: [], error: null });
    const response = await agreementApiResponse(client, user);
    expect(response?.status).toEqual(403); expect(response?.headers.get("Cache-Control")).toEqual("no-store");
    expect(await response?.json()).toEqual({ error: "Please agree to the Terms first." });
    query.select.mockResolvedValue({ data: [current], error: null });
    expect(await agreementApiResponse(client, user)).toBeNull();
    expect(await agreementApiResponse(client, { ...user, created_at: "2026-01-01" })).toBeNull();
  });
  it("S3,S10,S15,V3 exact immutable payload snapshots profile role and trusted email HMAC", async () => {
    const { client, query } = db();
    expect(await recordLegalAcceptance(client, { profileId: "p", email: " Person@Example.com ",
      source: "sign_up", client: "web" })).toEqual({ ok: true });
    expect(query.upsert.mock.calls).toEqual([[{
      profile_id: "p", terms_version: "2026-10-30", privacy_version: "2026-10-30",
      terms_sha256: LEGAL_DOCUMENTS.terms.versions["2026-10-30"],
      privacy_sha256: LEGAL_DOCUMENTS.privacy.versions["2026-10-30"], source: "sign_up",
      role_at_acceptance: "manager", client: "web", email_hmac_key_version: 1,
      email_hmac: createHmac("sha256", "test-key").update("person@example.com").digest("hex"), app_commit: "abcdef0"
    }, { onConflict: "profile_id,terms_version,privacy_version", ignoreDuplicates: true }]]);
  });
  it.each(["no_email", "no_hmac_key", "no_profile", "write_failed", "profile_read"])("returns %s without leaking details", async (code) => {
    const { client, query } = db(); const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (code === "no_hmac_key") vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "");
    if (code === "no_profile") query.maybeSingle.mockResolvedValue({ data: null, error: null });
    if (code === "profile_read") query.maybeSingle.mockResolvedValue({ data: null, error: { secret: "sensitive" } });
    if (code === "write_failed") query.upsert.mockRejectedValue(new Error("sensitive"));
    expect(await recordLegalAcceptance(client, { profileId: "p", email: code === "no_email" ? "" : "a@example.com",
      source: "invite", client: "web" })).toEqual({ ok: false, code });
    expect(log).toHaveBeenCalledWith("[legal] acceptance not saved", { source: "invite", code }); log.mockRestore();
  });
  it("S9 client is user-agent-reported", async () => {
    expect(await agreementClient()).toEqual("web"); mocks.native.mockResolvedValue(true);
    expect(await agreementClient()).toEqual("ios_app");
  });
  it("A4 next cannot skip onboarding, password setup or role boundaries", async () => {
    expect(await agreeDestination(user, "/manager?section=money")).toEqual("/manager?section=money");
    expect(await agreeDestination(user, "/agree")).toEqual("/manager");
    expect(await agreeDestination(user, "/owner")).toEqual("/manager");
    mocks.state.mockResolvedValue({ hasProfile: true, onboardingComplete: false, role: "manager", needsPasswordSet: false });
    expect(await agreeDestination(user, "/manager")).toEqual("/onboarding");
    mocks.state.mockResolvedValue({ hasProfile: true, onboardingComplete: false, role: "tenant", needsPasswordSet: true });
    expect(await agreeDestination(user, "/tenant")).toEqual("/complete-profile");
  });
});
