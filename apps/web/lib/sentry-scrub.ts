import type { Event, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY = /token|secret|password|key|account|routing|iban|card/i;

function scrubSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubSensitiveKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      SENSITIVE_KEY.test(key) ? [] : [[key, scrubSensitiveKeys(nestedValue)]]
    )
  );
}

export function scrubSentryEvent<T extends Event>(event: T, _hint?: EventHint): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;

    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(
          ([key]) => !/^(authorization|cookie)$/i.test(key)
        )
      );
    }
  }

  if (event.extra) {
    event.extra = scrubSensitiveKeys(event.extra) as Event["extra"];
  }

  if (event.contexts) {
    event.contexts = scrubSensitiveKeys(event.contexts) as Event["contexts"];
  }

  return event;
}
