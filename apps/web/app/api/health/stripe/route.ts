import { NextRequest, NextResponse } from "next/server";
import {
  checkResendConfigured,
  checkStripeConnectEnabled,
  checkStripeWebhookRegistered
} from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.HEALTH_CHECK_SECRET;

  // Allow unauthenticated access when the secret is unset so localhost/dev checks still work.
  if (expectedSecret) {
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      status: ok ? 200 : 503
    }
  );
}
