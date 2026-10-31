import type { Event, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY = /token|secret|password|key|account|routing|iban|card/i;
const PARAMETER = new RegExp(
  String.raw`(?:\b|(?<=%(?:25)*(?:3f|26)))(token_hash|access_token|refresh_token|token|code|next)` +
  String.raw`(=|%(?:25)*3d)(?:(?!%(?:25)*(?:26|23))[^\s&#"'<>])*`, "gi"
);

function stripQuery(value: string) {
  return value.split(/[?#]/, 1)[0];
}

export function scrubSentryEvent<T extends Event>(event: T, _hint?: EventHint): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([key]) => !/^(authorization|cookie)$/i.test(key))
      );
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    for (const key of ["url", "from", "to"]) {
      if (typeof breadcrumb.data?.[key] === "string") breadcrumb.data[key] = stripQuery(breadcrumb.data[key]);
    }
  }
  function scrubStrings(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) Reflect.deleteProperty(value, key);
      else if (typeof nested === "string") Reflect.set(value, key, nested.replace(PARAMETER, "$1$2[Filtered]"));
      else scrubStrings(nested);
    }
  }
  scrubStrings(event);
  return event;
}
