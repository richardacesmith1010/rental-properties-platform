export function assertProject(project, url, manifest) {
  const parsed = new URL(url);
  const ref = parsed.hostname.split(".")[0];
  if (!project || project !== ref || !parsed.hostname.endsWith(".supabase.co") ||
      (manifest && manifest.project !== project)) throw new Error("Project mismatch; nothing removed.");
}
export function runEmail(runId, role) {
  if (!/^[a-z0-9-]{6,60}$/.test(runId) || !["owner", "tenant", "signup"].includes(role)) throw new Error("Invalid run.");
  return `richard.ace.smith+259a-${runId}-${role}@gmail.com`;
}
export function assertManifestAccount(manifest, id, authUser, profile) {
  const account = manifest.accounts.find((entry) => entry.id === id);
  if (!account || !/^[0-9a-f-]{36}$/.test(id) || account.email !== runEmail(manifest.runId, account.label)) {
    throw new Error("Account not in this run; nothing removed.");
  }
  if (authUser && (authUser.id !== id || authUser.email !== account.email)) throw new Error("Email mismatch; nothing removed.");
  if (profile && (profile.id !== id || profile.email !== account.email || profile.is_tester !== true)) {
    throw new Error("Profile is not this run's tester; nothing removed.");
  }
  if (authUser && !profile) throw new Error("Tester profile missing; nothing removed.");
  return account;
}
export function creationPlan(runId) {
  return {
    create: ["owner", "tenant"].map((label) => ({ label, role: label, email: runEmail(runId, label) })),
    reserve: { label: "signup", role: "owner", email: runEmail(runId, "signup") }
  };
}
// Preflight the entire run before the first deletion. Resume only manifest ids after an interruption.
// A missing Auth user can mean its deletion succeeded before the process stopped; validate the remaining profile.
export async function cleanupAccounts({ project, url, manifest, load, deleteAuth, deleteProfile, save }) {
  assertProject(project, url, manifest);
  const states = [];
  for (const account of manifest.accounts) {
    const { authUser, profile } = await load(account.id);
    assertManifestAccount(manifest, account.id, authUser, profile);
    states.push({ account, authUser, profile });
  }
  const removed = [];
  for (const { account, authUser, profile } of states) {
    if (authUser) await deleteAuth(account.id);
    if (profile) await deleteProfile(account.id);
    account.removed = true;
    await save(manifest);
    removed.push(account.id);
  }
  return removed;
}
