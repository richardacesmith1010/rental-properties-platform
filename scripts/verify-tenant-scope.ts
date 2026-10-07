import { existsSync, readFileSync } from "node:fs";

function usage(): void {
  console.log("Usage: npx tsx scripts/verify-tenant-scope.ts --user <uuid>");
  console.log("Read-only check using apps/web/.env.local.");
}

async function main(): Promise<void> {
  const index = process.argv.indexOf("--user");
  if (process.argv.includes("--help")) {
    usage();
    return;
  }
  const userId = process.argv[index + 1];
  if (index < 0 || !userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
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
  const { getAdministeredProperties } = await import("../apps/web/lib/property-access");
  const { getPortfolioData } = await import("../apps/web/lib/portfolio");
  const admin = createAdminClient();
  const propertyIds = Array.from(new Set((await getAdministeredProperties(userId)).map((property) => property.id)));
  const portfolio = await getPortfolioData(userId, null, propertyIds);
  const { data: unitRows, error: unitError } = propertyIds.length
    ? await admin.from("units").select("id, property_id").in("property_id", propertyIds)
    : { data: [] as Array<{ id: string; property_id: string }>, error: null };
  if (unitError) throw new Error(`Unit query failed: ${unitError.code ?? "unknown"}`);
  const unitById = new Map((unitRows ?? []).map((unit) => [unit.id, unit.property_id]));
  const unitIds = Array.from(unitById.keys());
  const [{ data: leaseRows, error: leaseError }, { data: invitationRows, error: invitationError }] = await Promise.all([
    unitIds.length
      ? admin.from("leases").select("id, unit_id, tenant_profile_id, active").in("unit_id", unitIds)
      : Promise.resolve({ data: [] as Array<{ id: string; unit_id: string; tenant_profile_id: string; active: boolean }>,
        error: null }),
    propertyIds.length
      ? admin.from("invitations").select("email, property_id").eq("role", "tenant")
        .in("property_id", propertyIds).in("status", ["pending", "accepted"])
      : Promise.resolve({ data: [] as Array<{ email: string; property_id: string }>, error: null })
  ]);
  if (leaseError || invitationError) {
    throw new Error(`Scope query failed: ${leaseError?.code ?? invitationError?.code ?? "unknown"}`);
  }
  const leaseIds = new Set((leaseRows ?? []).map((lease) => lease.id));
  const activePropertiesByTenant = new Map<string, Set<string>>();
  for (const lease of leaseRows ?? []) {
    if (!lease.active) continue;
    const propertyId = unitById.get(lease.unit_id);
    if (!propertyId) continue;
    const ids = activePropertiesByTenant.get(lease.tenant_profile_id) ?? new Set<string>();
    ids.add(propertyId);
    activePropertiesByTenant.set(lease.tenant_profile_id, ids);
  }
  const invitedPropertiesByEmail = new Map<string, Set<string>>();
  for (const invitation of invitationRows ?? []) {
    const email = invitation.email.toLowerCase();
    const ids = invitedPropertiesByEmail.get(email) ?? new Set<string>();
    ids.add(invitation.property_id);
    invitedPropertiesByEmail.set(email, ids);
  }
  const offenders = new Set<string>();
  for (const tenant of portfolio.tenants) {
    if (tenant.id === userId) continue;
    const allowed = new Set([
      ...(activePropertiesByTenant.get(tenant.id) ?? []),
      ...(invitedPropertiesByEmail.get(tenant.email.toLowerCase()) ?? [])
    ]);
    if (!allowed.size || tenant.propertyIds.some((id) => !allowed.has(id))) offenders.add(tenant.id);
  }
  for (const lease of portfolio.leases) {
    if (!leaseIds.has(lease.id) || !lease.tenantProfileId ||
        !(leaseRows ?? []).some((row) => row.id === lease.id && row.tenant_profile_id === lease.tenantProfileId)) {
      offenders.add(lease.tenantProfileId || lease.id);
    }
  }
  if (offenders.size) {
    console.error(Array.from(offenders).sort().join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`TENANT SCOPE OK (${portfolio.tenants.length} tenants)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Tenant scope probe failed");
  process.exitCode = 1;
});
