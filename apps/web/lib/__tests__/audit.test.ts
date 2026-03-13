import { describe, expect, it } from "vitest";
import { formatAuditAction } from "../audit";

describe("formatAuditAction", () => {
  it("formats property creation", () => {
    expect(
      formatAuditAction("create_property", "property", { propertyName: "Atlas Heights" })
    ).toBe("Created property Atlas Heights");
  });

  it("formats property update without metadata", () => {
    expect(formatAuditAction("update_property", "property", {})).toBe("Updated property");
  });

  it("formats lease creation with tenant and unit", () => {
    expect(
      formatAuditAction("create_lease", "lease", {
        tenantEmail: "tenant@example.com",
        unitNumber: "2A"
      })
    ).toBe("Created lease for tenant@example.com in Unit 2A");
  });

  it("formats lease renewal", () => {
    expect(
      formatAuditAction("renew_lease", "lease", { tenantName: "Maya Bell" })
    ).toBe("Renewed lease for Maya Bell");
  });

  it("formats payment records", () => {
    expect(
      formatAuditAction("record_payment", "payment", { unitNumber: "4C" })
    ).toBe("Recorded payment for Unit 4C");
  });

  it("formats maintenance ticket creation", () => {
    expect(
      formatAuditAction("create_ticket", "maintenance_ticket", { propertyName: "Domus Flats" })
    ).toBe("Created maintenance ticket at Domus Flats");
  });

  it("formats maintenance comments", () => {
    expect(
      formatAuditAction("add_ticket_comment", "maintenance_ticket", { propertyName: "Domus Flats" })
    ).toBe("Added maintenance comment at Domus Flats");
  });

  it("falls back to readable action text", () => {
    expect(formatAuditAction("custom_event", "portfolio_snapshot", {})).toBe(
      "custom event portfolio snapshot"
    );
  });
});
