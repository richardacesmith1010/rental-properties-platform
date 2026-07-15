import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  checkResendConfigured,
  checkStripeConnectEnabled,
  checkStripeWebhookRegistered
} from "@/lib/health";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store"
};
const encoder = new TextEncoder();

function createJsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS
  });
}

function isLocalDevelopmentRequest(): boolean {
  return process.env.VERCEL_ENV === undefined && process.env.NODE_ENV !== "production";
}

function parseBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

function isAuthorizedHealthCheckRequest(request: NextRequest, expectedSecret: string): boolean {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return false;
  }

  const tokenBytes = encoder.encode(token);
  const expectedSecretBytes = encoder.encode(expectedSecret);

  if (tokenBytes.byteLength !== expectedSecretBytes.byteLength) {
    return false;
  }

  return timingSafeEqual(tokenBytes, expectedSecretBytes);
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.HEALTH_CHECK_SECRET;
  const localDevelopmentRequest = isLocalDevelopmentRequest();
  const hasExpectedSecret = typeof expectedSecret === "string" && expectedSecret.length > 0;

  if (!localDevelopmentRequest) {
    if (!hasExpectedSecret) {
      return createJsonResponse({ error: "health check not configured" }, 503);
    }

    if (!isAuthorizedHealthCheckRequest(request, expectedSecret)) {
      return createJsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const [connectEnabled, webhookRegistered] = await Promise.all([
    checkStripeConnectEnabled(),
    checkStripeWebhookRegistered()
  ]);
  const resendConfigured = checkResendConfigured();
  const ok = connectEnabled.ok && webhookRegistered.ok && resendConfigured.ok;

  return NextResponse.json(
    {
      ok,
      checks: {
        connectEnabled,
        webhookRegistered,
        resendConfigured
      },
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503,
      headers: NO_STORE_HEADERS
    }
  );
}
