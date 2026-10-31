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
    expect(() => assertProject("wrong", "https://expected.supabase.co")).toThrow(new Error("Project mismatch; nothing removed."));
    await expect(cleanupAccounts({ project: "wrong", url: "https://expected.supabase.co", manifest,
      load, deleteAuth, deleteProfile, save: vi.fn() })).rejects.toThrow(new Error("Project mismatch; nothing removed."));
    expect(load).not.toHaveBeenCalled(); expect(deleteAuth).not.toHaveBeenCalled(); expect(deleteProfile).not.toHaveBeenCalled();
  });
  it("AS2 a well-formed UUID outside the manifest is refused exactly", () => {
    const { manifest, state } = fixture();
    manifest.accounts.push({ id: "22222222-2222-4222-8222-222222222222", label: "tenant", email: runEmail("run123", "tenant") });
    expect(() => assertManifestAccount(manifest, "33333333-3333-4333-8333-333333333333", state.authUser, state.profile))
      .toThrow(new Error("Account not in this run; nothing removed."));
  });
  it.each([
    ["manifest", "Account not in this run; nothing removed."],
    ["email", "Email mismatch; nothing removed."],
    ["is_tester", "Profile is not this run's tester; nothing removed."],
    ["project", "Project mismatch; nothing removed."]
  ])("AS2-AS4 two-account cleanup deletes neither account when %s preflight fails", async (guard, message) => {
    const { manifest, state } = fixture();
    const second = { id: "22222222-2222-4222-8222-222222222222", label: "tenant", email: runEmail("run123", "tenant") };
    manifest.accounts.push(second);
    const load = vi.fn(async (accountId: string) => {
      if (accountId === id) return state;
      // Simulate the manifest losing the second identity while its asynchronous load is in flight.
      if (guard === "manifest") manifest.accounts.splice(1, 1);
      return { authUser: { id: second.id, email: guard === "email" ? "other@example.com" : second.email },
        profile: { id: second.id, email: second.email, is_tester: guard !== "is_tester" } };
    });
    const deleteAuth = vi.fn(), deleteProfile = vi.fn(), save = vi.fn();
    await expect(cleanupAccounts({ project: guard === "project" ? "wrong" : "expected",
      url: "https://expected.supabase.co", manifest, load, deleteAuth, deleteProfile, save })).rejects.toThrow(new Error(message));
    expect(load.mock.calls).toEqual(guard === "project" ? [] : [[id], [second.id]]);
    expect(deleteAuth).not.toHaveBeenCalled(); expect(deleteProfile).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
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
