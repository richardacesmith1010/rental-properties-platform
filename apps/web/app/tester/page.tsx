import { redirect } from "next/navigation";
import { getAuthenticatedUser, getRoleHomePath, getCurrentUserRole, isTester } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { TesterToolsSection, type TesterHealthRow } from "@/components/dashboard/tester-tools-section";
import { generateTesterData, cleanupTesterData } from "@/app/actions";

export const dynamic = "force-dynamic";

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

async function loadTableCount(table: string): Promise<TesterHealthRow> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from(table)
    .select("*", { head: true, count: "exact" });

  if (!error) {
    return { table, count: count ?? 0, status: "ok" };
  }

  if (isMissingSchemaError(error)) {
    return { table, count: null, status: "missing" };
  }

  return { table, count: null, status: "error" };
}

export default async function TesterPage() {
  const user = await getAuthenticatedUser();
  const [role, testerAccess] = await Promise.all([
    getCurrentUserRole(user.id),
    isTester(user.id)
  ]);

  if (!testerAccess) {
    redirect(getRoleHomePath(role));
  }

  const [capabilities, healthRows] = await Promise.all([
    getFeatureCapabilities(),
    Promise.all([
      loadTableCount("profiles"),
      loadTableCount("properties"),
      loadTableCount("units"),
      loadTableCount("leases"),
      loadTableCount("rent_charges"),
      loadTableCount("payments"),
      loadTableCount("maintenance_tickets"),
      loadTableCount("vendors"),
      loadTableCount("document_packets"),
      loadTableCount("property_files"),
      loadTableCount("property_expenses"),
      loadTableCount("ownership_accounts"),
      loadTableCount("notifications"),
      loadTableCount("notification_deliveries")
    ])
  ]);

  return (
    <main className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Tester Diagnostics</h1>
          <p className="text-sm text-zinc-600">
            Internal QA workspace for validating data health and exercising core flows.
          </p>
        </header>

        <TesterToolsSection
          userEmail={user.email ?? "unknown"}
          capabilities={capabilities}
          healthRows={healthRows}
          onGenerateTestData={generateTesterData}
          onCleanupTestData={cleanupTesterData}
        />
      </div>
    </main>
  );
}
