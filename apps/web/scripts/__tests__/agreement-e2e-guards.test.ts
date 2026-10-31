import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Operator script has no TypeScript declarations.
import { assertManifestAccount, assertProject, cleanupAccounts, creationPlan, runEmail } from "../agreement-e2e-guards.mjs";

const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const email = runEmail("run123", "owner");
  const manifest = { project: "expected", runId: "run123", accounts: [{ id, label: "owner", email }] };
  const state = { authUser: { id, email }, profile: { id, email, is_tester: true } };
  return { manifest, state };
}
describe("agreement account guards", () => {
  it("AS1 cleanup refuses a project mismatch before loading or deleting anything", async () => {
    const { manifest } = fixture(); const load = vi.fn(), deleteAuth = vi.fn(), deleteProfile = vi.fn();
    expect(() => assertProject("wrong", "https://expected.supabase.co")).toThrow("Project mismatch");
    await expect(cleanupAccounts({ project: "wrong", url: "https://expected.supabase.co", manifest,
      load, deleteAuth, deleteProfile, save: vi.fn() })).rejects.toThrow("Project mismatch");
    expect(load).not.toHaveBeenCalled(); expect(deleteAuth).not.toHaveBeenCalled(); expect(deleteProfile).not.toHaveBeenCalled();
  });
  it("AS2 refuses a UUID outside the manifest", () => {
    const { manifest, state } = fixture();
    expect(() => assertManifestAccount(manifest, "other", state.authUser, state.profile)).toThrow();
  });
  it.each(["email", "is_tester"])("AS3-AS4 cleanup deletes nothing when %s fails preflight", async (field) => {
    const { manifest, state } = fixture();
    Object.assign(state.profile, field === "email" ? { email: "other@example.com" } : { is_tester: false });
    const deleteAuth = vi.fn(), deleteProfile = vi.fn();
    await expect(cleanupAccounts({ project: "expected", url: "https://expected.supabase.co", manifest,
      load: async () => state, deleteAuth, deleteProfile, save: vi.fn() })).rejects.toThrow();
    expect(deleteAuth).not.toHaveBeenCalled(); expect(deleteProfile).not.toHaveBeenCalled();
  });
  it("AS5 interrupted cleanup resumes only remaining manifest accounts", async () => {
    const { manifest, state } = fixture();
    let authPresent = true, profilePresent = true;
    const deleteAuth = vi.fn(async () => { authPresent = false; });
    const deleteProfile = vi.fn().mockRejectedValueOnce(new Error("interrupted")).mockImplementation(async () => {
      profilePresent = false;
    });
    const options = { project: "expected", url: "https://expected.supabase.co", manifest,
      load: async () => ({ authUser: authPresent ? state.authUser : null, profile: profilePresent ? state.profile : null }),
      deleteAuth, deleteProfile, save: vi.fn() };
    await expect(cleanupAccounts(options)).rejects.toThrow("interrupted");
    expect(deleteAuth.mock.calls).toEqual([[id]]);
    expect(await cleanupAccounts(options)).toEqual([id]);
    expect(deleteAuth.mock.calls).toEqual([[id]]); expect(deleteProfile.mock.calls).toEqual([[id], [id]]);
    deleteProfile.mockClear(); await cleanupAccounts(options); expect(deleteProfile).not.toHaveBeenCalled();
  });
  it("create reserves the signup identity without creating it", () => {
    const plan = creationPlan("run123");
    expect(plan.create.map((account: { label: string }) => account.label)).toEqual(["owner", "tenant"]);
    expect(plan.reserve).toEqual({ label: "signup", role: "owner", email: runEmail("run123", "signup") });
  });
});
