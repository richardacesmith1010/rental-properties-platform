import { describe, expect, it } from "vitest";
import { getTenantPayState } from "@/lib/tenant-pay-state";
import { getNextRentDueDate } from "@/lib/tenant-pay-state";

const lease = { monthlyRentCents: 150000, dueDayOfMonth: 1 };
const charge = { amountCents: 150000, dueDate: "2026-10-01", status: "pending" as const };

describe("getTenantPayState", () => {
  it.each([
    ["can_pay", { charge, lease, ownerConnected: true, stripeConfigured: true }],
    ["not_ready", { charge, lease, ownerConnected: false, stripeConfigured: true }],
    ["not_ready", { charge: { ...charge, amountCents: 499 }, lease, ownerConnected: true, stripeConfigured: true }],
    ["not_ready", { charge, lease, ownerConnected: true, stripeConfigured: false }],
    ["outside", { charge: { ...charge, collectsOutsideDomus: true }, lease, ownerConnected: true, stripeConfigured: true }],
    ["paid", { lease, ownerConnected: true, stripeConfigured: true, lastPayment: { paidAt: "2026-09-01" } }],
    ["not_posted", { lease, ownerConnected: true, stripeConfigured: true }],
    ["no_lease", { lease: null, ownerConnected: true, stripeConfigured: true }]
  ] as const)("returns %s", (expected, input) => {
    expect(getTenantPayState(input)).toBe(expected);
  });

  it("allows a late charge to remain payable", () => {
    expect(getTenantPayState({
      charge: { ...charge, status: "late" },
      lease,
      ownerConnected: true,
      stripeConfigured: true
    })).toBe("can_pay");
  });

  it("uses the last day of short months", () => {
    expect(getNextRentDueDate(31, new Date("2026-02-10T00:00:00Z"))).toBe("2026-02-28");
    expect(getNextRentDueDate(31, new Date("2028-02-10T00:00:00Z"))).toBe("2028-02-29");
  });

  it("does not return a due date before the lease starts", () => {
    expect(getNextRentDueDate(1, new Date("2026-10-04T00:00:00Z"), "2026-11-15")).toBe("2026-11-15");
  });
});
