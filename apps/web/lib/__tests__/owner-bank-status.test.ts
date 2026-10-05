import { describe, expect, it } from "vitest";
import { getOwnerBankCardState } from "@/lib/owner-bank-status";

const accountHref = "/connect/onboard?accountId=account-1";

describe("getOwnerBankCardState", () => {
  it("returns not started when no Stripe account exists", () => {
    expect(getOwnerBankCardState({ rentCollectionConnected: false, connectHref: "/connect/onboard", accounts: [] }))
      .toEqual({ status: "not_started", href: "/connect/onboard" });
  });

  it("returns needs info when an account is not onboarded", () => {
    expect(getOwnerBankCardState({
      rentCollectionConnected: false,
      connectHref: accountHref,
      accounts: [{ stripeAccountId: "acct_1", stripeConnected: false, stripeStatus: null }]
    })).toEqual({ status: "needs_info", href: accountHref });
  });

  it.each(["restricted", "missing"] as const)("returns needs info for %s health", (stripeStatus) => {
    expect(getOwnerBankCardState({
      rentCollectionConnected: true,
      connectHref: accountHref,
      accounts: [{ stripeAccountId: "acct_1", stripeConnected: true, stripeStatus }]
    })).toEqual({ status: "needs_info", href: accountHref });
  });

  it("returns connected when collection and account health are ready", () => {
    expect(getOwnerBankCardState({
      rentCollectionConnected: true,
      connectHref: accountHref,
      accounts: [{ stripeAccountId: "acct_1", stripeConnected: true, stripeStatus: "active" }]
    })).toEqual({ status: "connected", href: accountHref });
  });

  it("uses the worst state across mixed accounts", () => {
    expect(getOwnerBankCardState({
      rentCollectionConnected: true,
      connectHref: accountHref,
      accounts: [
        { stripeAccountId: "acct_1", stripeConnected: true, stripeStatus: "active" },
        { stripeAccountId: "acct_2", stripeConnected: true, stripeStatus: "restricted" }
      ]
    })).toEqual({ status: "needs_info", href: accountHref });
  });

  it("recognizes an existing legacy profile account", () => {
    expect(getOwnerBankCardState({
      rentCollectionConnected: false,
      profileStripeConnected: true,
      connectHref: "/connect/onboard",
      accounts: []
    }).status).toBe("needs_info");
  });
});
