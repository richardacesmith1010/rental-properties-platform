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


describe("Sentry invitation canaries", () => {
  test.each(["token", "token_hash", "code", "access_token", "refresh_token", "next"])(
    "T20 removes %s values in every event surface and nested metadata", parameter => {
      const canary = "canary-11111111-1111-4111-8111-111111111111";
      const raw = `/join-llc?${parameter}=${canary}&safe=kept`;
      const encoded = encodeURIComponent(raw);
      const event = {
        request: { url: `${raw}#fragment`, query_string: `${parameter}=${canary}`, headers: { referer: raw } },
        breadcrumbs: [{ message: raw, data: { url: raw, from: raw, to: raw, nested: [{ token: canary, safe: encoded }] } }],
        message: `${parameter}=${canary}`, exception: { values: [{ type: "JoinError", value: encoded }] },
        extra: { route: "/join-llc", nested: [{ token: canary, detail: raw }] },
        contexts: { feature: { token: canary, nested: { safe: encoded } } },
        tags: { section: "members", nested: { token: canary }, detail: `next=${encoded}` }
      };
      scrubSentryEvent(event as unknown as Event);
      expect(JSON.stringify(event)).not.toContain("canary-");
      expect(event.request).toEqual({ url: "/join-llc", headers: { referer: `/join-llc?${parameter}=[Filtered]&safe=kept` } });
      expect(event.breadcrumbs[0].data.url).toEqual("/join-llc");
      expect(event.breadcrumbs[0].data.from).toEqual("/join-llc");
      expect(event.breadcrumbs[0].data.to).toEqual("/join-llc");
      expect(event.extra.route).toEqual("/join-llc"); expect(event.tags.section).toEqual("members");
      expect(event.exception.values[0].type).toEqual("JoinError");
      expect(event.extra.nested[0]).toEqual({ detail: `/join-llc?${parameter}=[Filtered]&safe=kept` });
    }
  );
});
