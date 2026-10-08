import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildDistributionConfigSnapshot,
  planCustomDistributionTransfers,
  planEqualDistributionTransfers,
  validateDistributionConfig
} from "@/lib/distributions";
import type { DistributionMemberRow } from "@/lib/distributions";

const members: DistributionMemberRow[] = [
  { profileId: "a", distributionPct: 50, payoutStripeAccountId: "acct_a" },
  { profileId: "b", distributionPct: 30, payoutStripeAccountId: "acct_b" },
  { profileId: "c", distributionPct: 20, payoutStripeAccountId: null }
];

describe("distribution pure planning", () => {
  it("plans equal shares for zero, one, two and three members with remainders", () => {
    expect(planEqualDistributionTransfers(1000, [])).toEqual({ memberShares: [], llcFallbackAmount: 1000 });
    expect(planEqualDistributionTransfers(1000, members.slice(0, 1))).toEqual({
      memberShares: [{ profileId: "a", amountCents: 1000, distributionPct: 100, destination: "acct_a" }],
      llcFallbackAmount: 0
    });
    expect(planEqualDistributionTransfers(1, members.slice(0, 2))).toEqual({
      memberShares: [{ profileId: "a", amountCents: 1, distributionPct: 50, destination: "acct_a" }],
      llcFallbackAmount: 0
    });
    expect(planEqualDistributionTransfers(1000, members)).toEqual({
      memberShares: [
        { profileId: "a", amountCents: 334, distributionPct: 33.33, destination: "acct_a" },
        { profileId: "b", amountCents: 333, distributionPct: 33.33, destination: "acct_b" }
      ],
      llcFallbackAmount: 333
    });
  });

  it("plans custom shares and preserves the current percentage normalization", () => {
    expect(planCustomDistributionTransfers(1000, [])).toEqual({ memberShares: [], llcFallbackAmount: 1000 });
    expect(planCustomDistributionTransfers(1, members.slice(0, 2))).toEqual({
      memberShares: [{ profileId: "a", amountCents: 1, distributionPct: 50, destination: "acct_a" }],
      llcFallbackAmount: 0
    });
    expect(planCustomDistributionTransfers(1000, members)).toEqual({
      memberShares: [
        { profileId: "a", amountCents: 500, distributionPct: 50, destination: "acct_a" },
        { profileId: "b", amountCents: 300, distributionPct: 30, destination: "acct_b" }
      ],
      llcFallbackAmount: 200
    });
    expect(planCustomDistributionTransfers(1000, [{ ...members[0], distributionPct: 0 }])).toEqual({
      memberShares: [], llcFallbackAmount: 1000
    });
  });

  it("validates totals of 100, 99.99 and 101 and an empty list", () => {
    expect(validateDistributionConfig("split_custom", new Map([["a", 50], ["b", 50]]))).toEqual({ valid: true });
    expect(validateDistributionConfig("split_custom", new Map([["a", 50], ["b", 49.99]]))).toEqual({ valid: true });
    expect(validateDistributionConfig("split_custom", new Map([["a", 50], ["b", 51]]))).toEqual({
      valid: false, error: "Percentages must sum to 100%. Current total: 101.00%"
    });
    expect(validateDistributionConfig("split_custom", new Map())).toEqual({
      valid: false, error: "Percentages must sum to 100%. Current total: 0.00%"
    });
    expect(validateDistributionConfig("retain", new Map())).toEqual({ valid: true });
  });

  it("builds retain, equal and custom snapshots for empty and uneven memberships", () => {
    expect(buildDistributionConfigSnapshot("retain", [])).toEqual({ mode: "retain", members: [] });
    expect(buildDistributionConfigSnapshot("split_equal", ["a"])).toEqual({
      mode: "split_equal", members: [{ profileId: "a", pct: 100 }]
    });
    expect(buildDistributionConfigSnapshot("split_equal", ["a", "b", "c"])).toEqual({
      mode: "split_equal",
      members: [{ profileId: "a", pct: 33.34 }, { profileId: "b", pct: 33.33 }, { profileId: "c", pct: 33.33 }]
    });
    expect(buildDistributionConfigSnapshot("split_custom", ["a", "b"], new Map([["a", 99.99], ["b", 0.01]]))).toEqual({
      mode: "split_custom", members: [{ profileId: "a", pct: 99.99 }, { profileId: "b", pct: 0.01 }]
    });
  });
});
