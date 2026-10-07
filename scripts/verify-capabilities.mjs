#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const tables = [
  "document_templates", "document_packets", "document_signers", "notifications",
  "notification_deliveries", "vendors", "maintenance_assignments", "maintenance_photos",
  "ownership_accounts", "ownership_account_members", "rental_listings", "rental_applications",
  "screening_reports", "application_events", "inbox_threads", "inbox_messages",
  "message_deliveries", "automation_templates", "automation_rules", "automation_runs"
];
const columns = [["properties", "owner_account_id"], ["invitations", "ownership_account_id"]];
const buckets = ["lease-documents", "maintenance-photos"];
const envFile = "apps/web/.env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("capabilities: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checks = await Promise.all([
  ...tables.map(async name => {
    const { error } = await db.from(name).select(name === "ownership_account_members" ? "account_id" : "id", { head: true }).limit(1);
    return { name: `table ${name}`, error };
  }),
  ...columns.map(async ([table, column]) => {
    const { error } = await db.from(table).select(column, { head: true }).limit(1);
    return { name: `column ${table}.${column}`, error };
  }),
  ...buckets.map(async name => {
    const { data, error } = await db.storage.getBucket(name);
    return { name: `bucket ${name}`, error: error || (!data?.id ? { code: "MISSING" } : null) };
  })
]);
const failed = checks.filter(check => check.error);
for (const check of failed) console.error(`capabilities: missing ${check.name} (${check.error.code ?? "ERROR"})`);
if (failed.length) process.exit(1);
console.log(`capabilities: ${checks.length}/${checks.length} available`);
