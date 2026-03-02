#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const PHASE10_TABLES = [
  "rental_listings",
  "rental_applications",
  "screening_reports",
  "application_events",
  "inbox_threads",
  "inbox_messages",
  "message_deliveries",
  "automation_templates",
  "automation_rules",
  "automation_runs",
];

const PHASE9_FUNCTION_CHECKS = [
  "can_administer_property",
  "can_view_property",
  "can_access_property",
];

const REQUIRED_AUTOMATION_TEMPLATE_KEYS = [
  "late_rent_sequence",
  "lease_renewal_sequence",
  "new_ticket_sla",
  "move_in_sequence",
  "move_out_sequence",
  "manager_vendor_followup",
];

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
  const { error } = await supabase.from(table).select("*").limit(1);

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

async function probeAutomationTemplateSeeds(supabase) {
  const { data, error } = await supabase
    .from("automation_templates")
    .select("key")
    .in("key", REQUIRED_AUTOMATION_TEMPLATE_KEYS)
    .limit(REQUIRED_AUTOMATION_TEMPLATE_KEYS.length + 4);

  if (error) {
    return {
      ok: false,
      foundKeys: [],
      missingKeys: [...REQUIRED_AUTOMATION_TEMPLATE_KEYS],
      error: normalizeError(error),
    };
  }

  const foundKeys = Array.from(new Set((data ?? []).map((entry) => entry.key))).sort();
  const missingKeys = REQUIRED_AUTOMATION_TEMPLATE_KEYS.filter(
    (key) => !foundKeys.includes(key)
  );

  return {
    ok: missingKeys.length === 0,
    foundKeys,
    missingKeys,
    error: null,
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
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local",
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
  for (const table of PHASE10_TABLES) {
    tableResults[table] = await probeTable(supabase, table);
  }

  const functionResults = {};
  for (const fnName of PHASE9_FUNCTION_CHECKS) {
    functionResults[fnName] = await probeFunction(supabase, fnName);
  }

  const seedResults = await probeAutomationTemplateSeeds(supabase);

  const summary = {
    tablesReady: Object.values(tableResults).every((entry) => entry.ok),
    phase9FunctionsReady: Object.values(functionResults).every((entry) => entry.ok),
    templateSeedsReady: seedResults.ok,
  };

  const report = {
    ok: Object.values(summary).every(Boolean),
    timestamp: now,
    projectRef: getProjectRef(url),
    checks: {
      tables: tableResults,
      phase9Functions: functionResults,
      templateSeeds: seedResults,
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
