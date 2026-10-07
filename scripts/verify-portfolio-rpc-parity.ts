import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

function usage(): void {
  console.log("Usage: npx tsx scripts/verify-portfolio-rpc-parity.ts --user <uuid> [--account <uuid>]");
  console.log("Read-only parity check against apps/web/.env.local. Output contains IDs only.");
}
function uuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}
async function main(): Promise<void> {
  if (process.argv.includes("--help")) { usage(); return; }
  const userId = process.argv[process.argv.indexOf("--user") + 1];
  const accountIndex = process.argv.indexOf("--account");
  const accountId = accountIndex >= 0 ? process.argv[accountIndex + 1] : undefined;
  if (!uuid(userId) || (accountIndex >= 0 && !uuid(accountId))) {
    usage();
    process.exitCode = 1;
    return;
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
    process.exitCode = child.status ?? 1;
    return;
  }
  const { createAdminClient } = await import("../apps/web/lib/supabase/admin");
  const {
    getAdministeredProperties, getAdministeredPropertyIdsForAccount,
    getAdministeredPropertyIdsForAccountLegacy
  } = await import("../apps/web/lib/property-access");
  const { getPortfolioData, getPortfolioDataLegacy } = await import("../apps/web/lib/portfolio");
  const administered = await getAdministeredProperties(userId);
  const accounts = accountId ? [accountId] : Array.from(new Set(administered
    .map((property) => property.ownerAccountId).filter((id) => !id.startsWith("legacy:"))));
  const admin = createAdminClient();
  const [idsProbe, portfolioProbe] = await Promise.all([
    admin.rpc("owner_administered_property_ids", { p_user_id: userId, p_account_id: accounts[0] ?? null }),
    admin.rpc("owner_portfolio_payload", { p_user_id: userId, p_property_ids: [] })
  ]);
  if (idsProbe.error || portfolioProbe.error) {
    throw new Error(JSON.stringify({ rpc_unavailable: {
      ids_code: idsProbe.error?.code ?? null, portfolio_code: portfolioProbe.error?.code ?? null
    } }));
  }
  const mismatch: Record<string, unknown> = {};
  for (const id of accounts) {
    const [rpcIds, legacyIds] = await Promise.all([
      getAdministeredPropertyIdsForAccount(userId, id),
      getAdministeredPropertyIdsForAccountLegacy(userId, id)
    ]);
    if (!isDeepStrictEqual([...rpcIds].sort(), [...legacyIds].sort())) {
      mismatch[id] = { rpc_ids: [...rpcIds].sort(), legacy_ids: [...legacyIds].sort() };
    }
  }
  const ids = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : administered.map((property) => property.id);
  const [rpcData, legacyData] = await Promise.all([
    getPortfolioData(userId, accountId, ids), getPortfolioDataLegacy(userId, accountId, ids)
  ]);
  if (!isDeepStrictEqual(rpcData, legacyData)) {
    mismatch.portfolio = Object.fromEntries(([
      "properties", "units", "leases", "tenants"
    ] as const).map((collection) => [collection, {
      rpc_ids: rpcData[collection].map((row) => row.id),
      legacy_ids: legacyData[collection].map((row) => row.id),
      values_differ: !isDeepStrictEqual(rpcData[collection], legacyData[collection])
    }]));
  }
  if (Object.keys(mismatch).length) {
    console.log(JSON.stringify(mismatch, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log("PARITY OK");
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN");
  process.exitCode = 1;
});
