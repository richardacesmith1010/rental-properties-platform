import { describe, expect, it } from "vitest";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

describe("payment fees", () => {
  it("calculates the card fee using the fee-on-fee formula", () => {
    expect(calculateCardFee(235000)).toEqual({
      baseCents: 235000,
      feeCents: 7050,
      totalCents: 242050
    });
  });

  it("returns the base amount and fee for smaller charges", () => {
    expect(calculateCardFee(10000)).toEqual({
      baseCents: 10000,
      feeCents: 330,
      totalCents: 10330
    });
  });

  it("formats cents as dollars", () => {
    expect(formatCentsAsDollars(242050)).toBe("$2,420.50");
  });
});
