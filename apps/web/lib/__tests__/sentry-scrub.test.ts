import { describe, expect, test } from "vitest";
import type { Event } from "@sentry/nextjs";
import { scrubSentryEvent } from "../sentry-scrub";

describe("scrubSentryEvent", () => {
  test("removes request secrets and sensitive extra and context keys", () => {
    const event: Event = {
      request: {
        cookies: { session: "private" },
        data: { rent: 1250 },
        headers: {
          Authorization: "Bearer private",
          cookie: "session=private",
          "content-type": "application/json"
        }
      },
      extra: {
        safe: "retained",
        accessToken: "private",
        nested: { cardLastFour: "4242", status: "ok" }
      },
      contexts: {
        payment: { bankAccount: "private", state: "pending" },
        feature: { name: "charges" }
      }
    };

    expect(scrubSentryEvent(event)).toEqual({
      request: {
        headers: { "content-type": "application/json" }
      },
      extra: {
        safe: "retained",
        nested: { status: "ok" }
      },
      contexts: {
        payment: { state: "pending" },
        feature: { name: "charges" }
      }
    });
  });
});
