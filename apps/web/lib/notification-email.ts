import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EmailOutcome {
  status: "sent" | "failed" | "skipped";
  providerRef?: string | null;
  errorMessage?: string | null;
  reason?: "duplicate" | "error";
}

interface DeliveryRow {
  id: string;
  status: "pending" | "sent" | "failed";
  claim_token: string | null;
  first_attempt_at: string | null;
  email_request_body: string | null;
  error_message: string | null;
}

interface NotificationEmailParams {
  notificationId: string;
  emailKey?: string;
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
}

function requestBody(params: NotificationEmailParams): string {
  return JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: params.to ? [params.to] : [],
    subject: params.subject,
    html: params.html,
    text: params.text
  });
}

function canRetry(row: DeliveryRow, now: Date): boolean {
  if (row.status !== "failed" || row.error_message?.startsWith("Not sent: ")) return false;
  if (!row.error_message?.startsWith("Unknown result: ")) return true;
  if (row.email_request_body === null) return false;
  const firstAttempt = row.first_attempt_at ? Date.parse(row.first_attempt_at) : NaN;
  return Number.isFinite(firstAttempt) && now.getTime() - firstAttempt < 20 * 60 * 60 * 1000;
}

function storedRecipientMatches(body: string | null, recipient: string | null | undefined): boolean {
  if (!body || !recipient) return false;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(payload.to) && payload.to.length === 1 && payload.to[0] === recipient &&
      !Object.hasOwn(payload, "cc") && !Object.hasOwn(payload, "bcc");
  } catch {
    return false;
  }
}

function providerError(status: number, json: { name?: string; message?: string }): string {
  if (status === 409 && json.name === "concurrent_idempotent_requests") {
    return "Unknown result: concurrent request";
  }
  if (status === 409 && json.name === "invalid_idempotent_request") {
    return "Not sent: key reused with different content";
  }
  const message = typeof json.message === "string" ? json.message : `Resend error ${status}`;
  return status === 429 || status >= 500 || status === 409 ? `Unknown result: ${message}` : message;
}

async function sendClaimedEmail(body: string, idempotencyKey: string): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !process.env.RESEND_FROM_EMAIL) {
    return { status: "failed", errorMessage: "Email delivery not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL)." };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body,
      cache: "no-store"
    });
    const json = await response.json() as { id?: string; name?: string; message?: string };
    return response.ok
      ? { status: "sent", providerRef: typeof json.id === "string" ? json.id : null }
      : { status: "failed", errorMessage: providerError(response.status, json) };
  } catch (error) {
    return {
      status: "failed",
      errorMessage: `Unknown result: ${error instanceof Error ? error.message : "Email delivery error"}`
    };
  }
}

export async function sendNotificationEmail(
  admin: ReturnType<typeof createAdminClient>,
  params: NotificationEmailParams
): Promise<EmailOutcome> {
  const now = new Date();
  const token = randomUUID();
  const body = requestBody(params);
  const key = params.emailKey ?? null;
  const table = admin.from("notification_deliveries");
  const { data: inserted, error: insertError } = await table.insert({
    notification_id: params.notificationId,
    channel: "email",
    status: "pending",
    email_key: key,
    claim_token: token,
    attempted_at: now.toISOString(),
    first_attempt_at: now.toISOString(),
    email_request_body: body
  }).select("id, status, claim_token, first_attempt_at, email_request_body, error_message").single();

  let claim: DeliveryRow | null = inserted as DeliveryRow | null;
  let claimedBody = body;
  let reclaimedExisting = false;
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error(`[notifications] email_claim: ${insertError.code ?? "unknown"}`);
      return { status: "skipped", reason: "error" };
    }
    const existingQuery = admin.from("notification_deliveries")
      .select("id, status, claim_token, first_attempt_at, email_request_body, error_message")
      .eq("notification_id", params.notificationId).eq("channel", "email");
    const { data: existing, error: lookupError } = await (key === null
      ? existingQuery.is("email_key", null) : existingQuery.eq("email_key", key)).maybeSingle();
    if (lookupError || !existing) {
      console.error(`[notifications] email_claim_lookup: ${lookupError?.code ?? "missing_row"}`);
      return { status: "skipped", reason: "error" };
    }
    const row = existing as DeliveryRow;
    if (!canRetry(row, now)) {
      console.info(`[notifications] email_duplicate: ${row.id}`);
      return { status: "skipped", reason: "duplicate" };
    }
    const legacyBody = row.email_request_body === null;
    const updateQuery = admin.from("notification_deliveries").update({
      status: "pending", claim_token: token, attempted_at: now.toISOString(),
      ...(legacyBody ? { email_request_body: body } : {}),
      ...(legacyBody && row.first_attempt_at === null ? { first_attempt_at: now.toISOString() } : {})
    }).eq("id", row.id).eq("status", "failed");
    const { data: reclaimed, error: reclaimError } = await (row.claim_token
      ? updateQuery.eq("claim_token", row.claim_token) : updateQuery.is("claim_token", null))
      .select("id, status, claim_token, first_attempt_at, email_request_body, error_message").maybeSingle();
    if (reclaimError) {
      console.error(`[notifications] email_reclaim: ${reclaimError.code ?? "unknown"}`);
      return { status: "skipped", reason: "error" };
    }
    if (!reclaimed) return { status: "skipped", reason: "duplicate" };
    claim = reclaimed as DeliveryRow;
    claimedBody = claim.email_request_body ?? "";
    reclaimedExisting = true;
  }
  if (!claim) return { status: "skipped", reason: "error" };

  // With the unique index, Domus owns at most one send per notification and key. Unknown provider
  // outcomes use identical bytes and Resend's 24-hour key, with retries ending after 20 hours.
  const outcome = !params.to
    ? { status: "failed" as const, errorMessage: reclaimedExisting
      ? "Not sent: recipient changed" : "Recipient email missing." }
    : !storedRecipientMatches(claimedBody, params.to)
      ? { status: "failed" as const, errorMessage: "Not sent: recipient changed" }
      : await sendClaimedEmail(claimedBody, `domus-n-${params.notificationId}${key === null ? "" : `-k-${key}`}`);

  const { data: recorded, error: recordError } = await admin.from("notification_deliveries").update({
    status: outcome.status,
    provider_ref: "providerRef" in outcome ? outcome.providerRef ?? null : null,
    error_message: "errorMessage" in outcome ? outcome.errorMessage ?? null : null,
    attempted_at: new Date().toISOString()
  }).eq("id", claim.id).eq("claim_token", token).select("id").maybeSingle();
  if (recordError || !recorded) {
    console.error(`[notifications] email_record: ${recordError?.code ?? "claim_lost"}`);
  }
  return outcome;
}

export async function insertDeliveryRecord(
  admin: ReturnType<typeof createAdminClient>,
  row: { notification_id: string; channel: "in_app"; status: "sent" }
): Promise<boolean> {
  const { error } = await admin.from("notification_deliveries").insert(row);
  if (error) console.error(`[notifications] in_app_record: ${error.code ?? "unknown"}`);
  return !error;
}
