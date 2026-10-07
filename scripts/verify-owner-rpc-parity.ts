import { readFileSync, existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

function usage(): void {
  console.log("Usage: npx tsx scripts/verify-owner-rpc-parity.ts --user <uuid>");
  console.log("Read-only parity check against the configured apps/web/.env.local Supabase project.");
}
async function main(): Promise<void> {
const userIndex = process.argv.indexOf("--user");
if (process.argv.includes("--help") || userIndex < 0) {
  usage();
  process.exit(process.argv.includes("--help") ? 0 : 1);
}
const userId = process.argv[userIndex + 1];
if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  usage();
  process.exit(1);
}
const envFile = "apps/web/.env.local";
if (!existsSync(envFile)) throw new Error(`${envFile} is required`);
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
if (!process.env.TSX_TSCONFIG_PATH) {
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" }, stdio: "inherit"
  });
  process.exit(child.status ?? 1);
}
const { getAdministeredPropertyIds } = await import("../apps/web/lib/property-access");
const { getDashboardData, getDashboardDataLegacy } = await import("../apps/web/lib/dashboard");
const { getOwnershipAccountsForUser, getOwnershipAccountsForUserLegacy } = await import("../apps/web/lib/ownership");
const { createAdminClient } = await import("../apps/web/lib/supabase/admin");
const admin = createAdminClient();
const [dashboardCheck, ownershipCheck] = await Promise.all([
  admin.rpc("owner_dashboard_payload", { p_property_ids: [], p_today: new Date().toISOString().slice(0, 10) }),
  admin.rpc("ownership_accounts_payload", { p_user_id: userId })
]);
if (dashboardCheck.error || ownershipCheck.error) {
  throw new Error(`RPC unavailable: dashboard=${dashboardCheck.error?.code ?? "OK"}, `
    + `ownership=${ownershipCheck.error?.code ?? "OK"}`);
}
const propertyIds = await getAdministeredPropertyIds(userId);
const [dashboardRpc, dashboardLegacy, ownershipRpc, ownershipLegacy] = await Promise.all([
  getDashboardData(userId, null, propertyIds, "owner"),
  getDashboardDataLegacy(userId, null, propertyIds, "owner"),
  getOwnershipAccountsForUser(userId),
  getOwnershipAccountsForUserLegacy(userId)
]);
const mismatch: Record<string, unknown> = {};
if (!isDeepStrictEqual(dashboardRpc, dashboardLegacy)) {
  mismatch.dashboard = { rpc: dashboardRpc, legacy: dashboardLegacy };
}
if (!isDeepStrictEqual(ownershipRpc, ownershipLegacy)) {
  mismatch.ownership = { rpc: ownershipRpc, legacy: ownershipLegacy };
}
if (Object.keys(mismatch).length) {
  console.log(JSON.stringify(mismatch, null, 2));
  process.exit(1);
}
console.log(`PARITY OK (dashboard, ownership; ${propertyIds.length} properties)`);

}
void main().catch(error => { console.error(error); process.exit(1); });
