import { describe, expect, it } from "vitest";
import { getTenantPayState } from "@/lib/tenant-pay-state";

const lease = { monthlyRentCents: 150000, dueDayOfMonth: 1 };
const charge = { amountCents: 150000, dueDate: "2026-10-01", status: "pending" as const };

describe("getTenantPayState", () => {
  it.each([
    ["can_pay", { charge, ownerConnected: true, stripeConfigured: true }],
    ["not_ready", { charge, ownerConnected: false, stripeConfigured: true }],
    ["not_ready", { charge: { ...charge, amountCents: 499 }, ownerConnected: true, stripeConfigured: true }],
    ["not_ready", { charge, ownerConnected: true, stripeConfigured: false }],
    ["outside", { charge: { ...charge, collectsOutsideDomus: true }, ownerConnected: true, stripeConfigured: true }],
    ["paid", { lease, ownerConnected: true, stripeConfigured: true, lastPayment: { paidAt: "2026-09-01" } }],
    ["not_posted", { lease, ownerConnected: true, stripeConfigured: true }]
  ] as const)("returns %s", (expected, input) => {
    expect(getTenantPayState(input)).toBe(expected);
  });

  it("allows a late charge to remain payable", () => {
    expect(getTenantPayState({ charge: { ...charge, status: "late" }, ownerConnected: true, stripeConfigured: true })).toBe("can_pay");
  });
});
