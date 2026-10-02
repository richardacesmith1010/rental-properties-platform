import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

export function getSentryOptions(environment: string): Parameters<typeof Sentry.init>[0] {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent
  } as Parameters<typeof Sentry.init>[0];
}
