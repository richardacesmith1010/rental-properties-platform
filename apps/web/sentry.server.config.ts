import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry-options";

Sentry.init(getSentryOptions(process.env.VERCEL_ENV ?? "development"));
