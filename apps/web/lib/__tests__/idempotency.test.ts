import { describe, expect, it } from "vitest";
import {
  getVendorAssignmentPlan,
  shouldRecordSuccessfulDelivery,
  shouldThrottleDocumentPacketSend
} from "@/lib/idempotency";

describe("shouldThrottleDocumentPacketSend", () => {
  it("returns true when resend happens inside cooldown window", () => {
    const now = Date.parse("2026-02-28T12:00:30.000Z");
    const sentAt = "2026-02-28T12:00:00.000Z";

    expect(shouldThrottleDocumentPacketSend(sentAt, now, 60_000)).toBe(true);
  });

  it("returns false when cooldown has elapsed", () => {
    const now = Date.parse("2026-02-28T12:02:01.000Z");
    const sentAt = "2026-02-28T12:00:00.000Z";

    expect(shouldThrottleDocumentPacketSend(sentAt, now, 60_000)).toBe(false);
  });
});

describe("getVendorAssignmentPlan", () => {
  it("skips duplicate assignments for the same vendor", () => {
    expect(getVendorAssignmentPlan("vendor-1", "vendor-1")).toEqual({
      shouldInsert: false,
      status: "assigned"
    });
  });

  it("uses assigned status when no prior vendor exists", () => {
    expect(getVendorAssignmentPlan(null, "vendor-2")).toEqual({
      shouldInsert: true,
      status: "assigned"
    });
  });

  it("uses reassigned status when changing vendors", () => {
    expect(getVendorAssignmentPlan("vendor-1", "vendor-2")).toEqual({
      shouldInsert: true,
      status: "reassigned"
    });
  });
});

describe("shouldRecordSuccessfulDelivery", () => {
  it("returns false when a sent row already exists for channel", () => {
    expect(
      shouldRecordSuccessfulDelivery(
        [
          { channel: "in_app", status: "sent" },
          { channel: "email", status: "failed" }
        ],
        "in_app"
      )
    ).toBe(false);
  });

  it("returns true when channel has no successful row yet", () => {
    expect(
      shouldRecordSuccessfulDelivery(
        [
          { channel: "in_app", status: "failed" },
          { channel: "email", status: "failed" }
        ],
        "email"
      )
    ).toBe(true);
  });
});
