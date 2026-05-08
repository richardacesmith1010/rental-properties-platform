const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const recentAlerts = new Map<string, number>();

function isInDedupeWindow(dedupeKey: string): boolean {
  const lastSentAt = recentAlerts.get(dedupeKey);

  if (!lastSentAt) {
    return false;
  }

  return Date.now() - lastSentAt < DEDUPE_WINDOW_MS;
}

function markAlerted(dedupeKey: string): void {
  recentAlerts.set(dedupeKey, Date.now());
}

export async function sendPlatformAlert(params: {
  subject: string;
  body: string;
  dedupeKey: string;
}): Promise<{ sent: boolean; reason?: "deduped" | "no_recipient_configured" | "send_failed" }> {
  if (isInDedupeWindow(params.dedupeKey)) {
    return { sent: false, reason: "deduped" };
  }

  const to = process.env.PLATFORM_ALERT_EMAIL || process.env.RESEND_FROM_EMAIL;
  if (!to) {
    return { sent: false, reason: "no_recipient_configured" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("[platform-alerts] missing RESEND configuration");
    return { sent: false, reason: "send_failed" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Domus Platform Alert] ${params.subject}`,
        text: params.body
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      let responseBody: unknown = null;

      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }

      console.error("[platform-alerts] failed to send:", response.status, responseBody);
      return { sent: false, reason: "send_failed" };
    }

    markAlerted(params.dedupeKey);
    return { sent: true };
  } catch (error) {
    console.error("[platform-alerts] failed to send:", error);
    return { sent: false, reason: "send_failed" };
  }
}
