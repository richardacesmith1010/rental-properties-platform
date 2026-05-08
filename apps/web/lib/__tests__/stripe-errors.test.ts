import { describe, expect, it } from "vitest";
import { categorizeStripeError, userMessageForCategory } from "@/lib/stripe-errors";

describe("categorizeStripeError", () => {
  it("identifies platform misconfiguration errors", () => {
    const cases = [
      "You can only create new accounts if you've signed up for Connect",
      "Stripe Connect not enabled",
      "Platform is not configured for Connect"
    ];

    cases.forEach((message) => {
      expect(categorizeStripeError(new Error(message))).toBe("platform_misconfigured");
    });
  });

  it("identifies owner-not-connected errors", () => {
    const cases = [
      "No such destination: 'acct_xxx'",
      "resource_missing: destination does not exist",
      "account_invalid"
    ];

    cases.forEach((message) => {
      expect(categorizeStripeError(new Error(message))).toBe("owner_not_connected");
    });
  });

  it("identifies transient errors", () => {
    const cases = ["fetch failed", "network timeout", "Stripe API failed: 503"];

    cases.forEach((message) => {
      expect(categorizeStripeError(new Error(message))).toBe("transient");
    });
  });

  it("falls back to unknown for unrecognized errors", () => {
    expect(categorizeStripeError(new Error("some weird error"))).toBe("unknown");
  });

  it("handles non-Error inputs", () => {
    expect(categorizeStripeError("plain string")).toBe("unknown");
    expect(categorizeStripeError(null)).toBe("unknown");
    expect(categorizeStripeError(undefined)).toBe("unknown");
  });
});

describe("userMessageForCategory", () => {
  it("returns plain-language messages with no jargon", () => {
    const transient = userMessageForCategory("transient");
    expect(transient).toMatch(/try again/i);
    expect(transient).not.toMatch(/internal|HTTP|API|stack/i);

    const ownerIssue = userMessageForCategory("owner_not_connected");
    expect(ownerIssue).toMatch(/owner|manager/i);

    const platformIssue = userMessageForCategory("platform_misconfigured");
    expect(platformIssue).toMatch(/being set up/i);
  });

  it("returns a friendly message for the unknown category", () => {
    expect(userMessageForCategory("unknown")).toMatch(/message your property manager/i);
  });
});
