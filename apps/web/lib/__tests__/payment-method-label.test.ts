import { describe, expect, it } from "vitest";
import { paymentMethodLabel } from "@/lib/payment-method-label";

describe("paymentMethodLabel", () => {
  it.each([
    ["ach", "Bank transfer"], ["card", "Card"], ["cash", "Cash"],
    ["check", "Check"], ["other", "Other"], ["ACH", "Bank transfer"],
    ["zelle", "Zelle"]
  ])("labels %s as %s", (method, label) => {
    expect(paymentMethodLabel(method)).toBe(label);
  });
});
