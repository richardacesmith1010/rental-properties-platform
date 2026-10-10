import { describe, expect, it } from "vitest";
import { rulesFor, tenantEligibleForEvent } from "@/lib/notification-policy";

describe("notification event policy", () => {
  it("separates payment and failure events that share a database type", () => {
    expect(rulesFor("rent_paid_manual").excludeActor).toBe(true);
    expect(rulesFor("rent_paid_stripe").excludeActor).toBe(false);
    expect(rulesFor("late_fee").tenant).toBe("in_domus_only");
    expect(rulesFor("autopay_failed").tenant).toBe("always");
  });

  it("fails closed for missing or unreadable outside-Domus flags", () => {
    for (const event of ["rent_paid_manual", "late_fee", "overdue_followup", "rent_due_reminder"] as const) {
      expect(tenantEligibleForEvent(event, true)).toBe(false);
      expect(tenantEligibleForEvent(event, null)).toBe(false);
      expect(tenantEligibleForEvent(event, "false")).toBe(false);
      expect(tenantEligibleForEvent(event, false)).toBe(true);
    }
    expect(tenantEligibleForEvent("autopay_failed", true)).toBe(true);
    expect(tenantEligibleForEvent("bank_payment_failed", true)).toBe(true);
  });

  it("routes tickets and leases with their event-specific email rules", () => {
    expect(rulesFor("ticket_created")).toMatchObject({ managers: "all_homes", tenant: "never", email: true });
    expect(rulesFor("ticket_comment")).toMatchObject({ managers: "all_homes", tenant: "always", email: false, excludeActor: true });
    expect(rulesFor("ticket_resolved")).toMatchObject({ owners: false, managers: "none", tenant: "always" });
    expect(rulesFor("lease_changed")).toMatchObject({ owners: false, managers: "none", email: false });
    expect(rulesFor("lease_ending_soon")).toMatchObject({ owners: true, managers: "all_homes" });
  });
});
