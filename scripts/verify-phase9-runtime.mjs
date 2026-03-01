#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const PHASE_TABLES = [
  "document_templates",
  "document_packets",
  "document_signers",
  "notifications",
  "notification_deliveries",
  "vendors",
  "maintenance_assignments",
  "maintenance_photos",
  "ownership_accounts",
  "ownership_account_members",
];

const COLUMN_CHECKS = [
  { table: "properties", column: "owner_account_id" },
  { table: "invitations", column: "ownership_account_id" },
];

const FUNCTION_CHECKS = [
  "can_administer_property",
  "can_view_property",
  "can_access_property",
];

const BUCKET_CHECKS = ["lease-documents", "maintenance-photos"];

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    env[key] = value;
  }

  return env;
}

function getProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function isNotFoundFunction(error) {
  if (!error) {
    return false;
  }

  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return code === "PGRST202" || message.includes("could not find the function");
}

async function probeTable(supabase, table) {
  const { error } = await supabase
    .from(table)
    .select("id", { head: true, count: "exact" })
    .limit(1);

  return {
    ok: !error,
    error: normalizeError(error),
  };
}

async function probeColumn(supabase, table, column) {
  const { error } = await supabase
    .from(table)
    .select(column, { head: true, count: "exact" })
    .limit(1);

  return {
    ok: !error,
    error: normalizeError(error),
  };
}

async function probeFunction(supabase, fnName) {
  const { data, error } = await supabase.rpc(fnName, {
    target_property_id: "00000000-0000-0000-0000-000000000000",
  });

  const available = !isNotFoundFunction(error);

  return {
    ok: available,
    callable: !error,
    data: data ?? null,
    error: normalizeError(error),
  };
}

async function probeBucket(supabase, bucketName) {
  const { data, error } = await supabase.storage.getBucket(bucketName);

  return {
    ok: Boolean(data?.id) && data.public === false && !error,
    exists: Boolean(data?.id) && !error,
    private: data?.public === false,
    error: normalizeError(error),
  };
}

async function probeOwnerAccountBackfill(supabase, ownerAccountColumnPresent) {
  if (!ownerAccountColumnPresent) {
    return {
      ok: false,
      skipped: true,
      reason: "properties.owner_account_id column not present",
      nullCount: null,
      error: null,
    };
  }

  const { count, error } = await supabase
    .from("properties")
    .select("id", { head: true, count: "exact" })
    .is("owner_account_id", null);

  const nullCount = count ?? null;

  return {
    ok: !error && nullCount === 0,
    skipped: false,
    reason: null,
    nullCount,
    error: normalizeError(error),
  };
}

async function main() {
  const envPath = path.resolve("apps/web/.env.local");
  const now = new Date().toISOString();

  if (!fs.existsSync(envPath)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          timestamp: now,
          error: `Missing env file: ${envPath}`,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          timestamp: now,
          error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const tableResults = {};
  for (const table of PHASE_TABLES) {
    tableResults[table] = await probeTable(supabase, table);
  }

  const columnResults = {};
  for (const check of COLUMN_CHECKS) {
    columnResults[`${check.table}.${check.column}`] = await probeColumn(
      supabase,
      check.table,
      check.column
    );
  }

  const functionResults = {};
  for (const fnName of FUNCTION_CHECKS) {
    functionResults[fnName] = await probeFunction(supabase, fnName);
  }

  const bucketResults = {};
  for (const bucket of BUCKET_CHECKS) {
    bucketResults[bucket] = await probeBucket(supabase, bucket);
  }

  const backfillResult = await probeOwnerAccountBackfill(
    supabase,
    Boolean(columnResults["properties.owner_account_id"]?.ok)
  );

  const summary = {
    tablesReady: Object.values(tableResults).every((entry) => entry.ok),
    columnsReady: Object.values(columnResults).every((entry) => entry.ok),
    functionsReady: Object.values(functionResults).every((entry) => entry.ok),
    bucketsReady: Object.values(bucketResults).every((entry) => entry.ok),
    ownerAccountBackfillReady: backfillResult.ok,
  };

  const report = {
    ok: Object.values(summary).every(Boolean),
    timestamp: now,
    projectRef: getProjectRef(url),
    checks: {
      tables: tableResults,
      columns: columnResults,
      functions: functionResults,
      buckets: bucketResults,
      ownerAccountBackfill: backfillResult,
    },
    summary,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
