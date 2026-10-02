import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry-options";

Sentry.init(getSentryOptions(process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development"));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
