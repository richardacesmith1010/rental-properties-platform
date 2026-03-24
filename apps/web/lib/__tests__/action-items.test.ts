import { describe, expect, it } from "vitest";
import { computeActionItems, getNextRentCollectionLabel } from "@/lib/action-items";

describe("action items", () => {
  it("sorts urgent items before attention and info items", () => {
    const items = computeActionItems({
      charges: [
        {
          id: "charge-late",
          leaseId: "lease-1",
          propertyId: "property-1",
          tenantProfileId: "tenant-1",
          dueDate: "2026-03-01",
          amountCents: 235000,
          status: "late",
          propertyName: "1st Home",
          unitNumber: "Unit A",
          tenantName: "Angel Hernandez",
          tenantEmail: "angel@example.com",
          category: "rent"
        },
        {
          id: "charge-soon",
          leaseId: "lease-2",
          propertyId: "property-1",
          tenantProfileId: "tenant-2",
          dueDate: "2026-03-26",
          amountCents: 150000,
          status: "pending",
          propertyName: "2nd Home",
          unitNumber: "Unit B",
          tenantName: "Morgan Vale",
          tenantEmail: "morgan@example.com",
          category: "rent"
        }
      ],
      tickets: [],
      managerPayments: [],
      leases: [],
      pendingInvitations: [
        {
          id: "invite-1",
          ownershipAccountId: "account-1",
          invitedBy: "owner-1",
          email: "coowner@example.com",
          token: "token-1",
          status: "pending",
          createdAt: "2026-03-20T12:00:00.000Z",
          acceptedAt: null
        }
      ],
      newFeedbackCount: 2,
      today: new Date("2026-03-24T12:00:00.000Z")
    });

    expect(items.map((item) => item.kind)).toEqual([
      "overdue_charge",
      "due_soon_charge",
      "pending_members",
      "feedback"
    ]);
  });

  it("aggregates urgent maintenance and expiring leases", () => {
    const items = computeActionItems({
      charges: [],
      tickets: [
        {
          id: "ticket-1",
          propertyId: "property-1",
          propertyName: "1st Home",
          unitNumber: "Unit A",
          title: "Water heater leak",
          description: "Leaks behind closet.",
          status: "open",
          priority: "urgent",
          actualCostCents: null,
          vendorName: null,
          assignmentStatus: null,
          photoCount: 0,
          latestPhotoId: null,
          photos: [],
          createdAt: "2026-03-22T12:00:00.000Z",
          resolvedAt: null,
          tenantEmail: "angel@example.com",
          commentCount: 0,
          comments: [],
          timeline: []
        }
      ],
      managerPayments: [],
      leases: [
        {
          id: "lease-1",
          unitId: "unit-1",
          propertyId: "property-1",
          propertyName: "1st Home",
          tenantProfileId: "tenant-1",
          unitLabel: "Unit A",
          tenantName: "Angel Hernandez",
          tenantEmail: "angel@example.com",
          tenantPhone: null,
          monthlyRentCents: 235000,
          depositCents: 235000,
          dueDayOfMonth: 1,
          startDate: "2025-04-01",
          endDate: "2026-04-10",
          leaseStatus: "active",
          gracePeriodDays: 5,
          lateFeeCents: 0,
          notes: null,
          active: true
        }
      ],
      pendingInvitations: [],
      newFeedbackCount: 0,
      today: new Date("2026-03-24T12:00:00.000Z")
    });

    expect(items.map((item) => item.kind)).toEqual(["maintenance", "lease_expiring"]);
    expect(items[0]?.title).toContain("Water heater leak");
    expect(items[1]?.title).toContain("Angel Hernandez");
  });

  it("builds a next rent collection label from future pending charges", () => {
    const label = getNextRentCollectionLabel({
      charges: [
        {
          id: "charge-1",
          leaseId: "lease-1",
          propertyId: "property-1",
          tenantProfileId: "tenant-1",
          dueDate: "2026-03-28",
          amountCents: 210000,
          status: "pending",
          propertyName: "Oak Street",
          unitNumber: "Unit A",
          tenantName: "Avery",
          category: "rent"
        }
      ],
      leases: [],
      today: new Date("2026-03-24T12:00:00.000Z")
    });

    expect(label).toBe("Your next rent collection is in 4 days.");
  });

  it("falls back to active lease due days when no pending charges exist yet", () => {
    const label = getNextRentCollectionLabel({
      charges: [],
      leases: [
        {
          id: "lease-1",
          unitId: "unit-1",
          propertyId: "property-1",
          propertyName: "Oak Street",
          tenantProfileId: "tenant-1",
          unitLabel: "Unit A",
          tenantName: "Avery",
          tenantEmail: "avery@example.com",
          tenantPhone: null,
          monthlyRentCents: 210000,
          depositCents: 0,
          dueDayOfMonth: 1,
          startDate: "2026-04-01",
          endDate: "2027-03-31",
          leaseStatus: "active",
          gracePeriodDays: 5,
          lateFeeCents: 0,
          notes: null,
          active: true
        }
      ],
      today: new Date("2026-03-24T12:00:00.000Z")
    });

    expect(label).toBe("Your next rent collection is in 8 days.");
  });
});
