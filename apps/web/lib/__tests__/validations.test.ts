import { describe, it, expect } from "vitest";
import {
  createPropertySchema,
  createUnitSchema,
  createLeaseSchema,
  payChargeSchema,
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  inviteTenantSchema,
  inviteManagerSchema,
  resendInviteSchema,
  createDocumentTemplateSchema,
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  markNotificationReadSchema,
  createVendorSchema,
  updateVendorSchema,
  assignVendorSchema,
  uploadMaintenancePhotoSchema,
  uploadPropertyFileSchema,
  deletePropertyFileSchema,
  updateFileVisibilitySchema,
  createExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  grantTesterAccessSchema,
  revokeTesterAccessSchema,
  parseFormData,
} from "../validations";

/* ─── createPropertySchema ─── */
describe("createPropertySchema", () => {
  it("accepts valid property data", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ZIP+4 format", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701-1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createPropertySchema.safeParse({
      name: "",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ZIP code", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "ABC",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── createUnitSchema ─── */
describe("createUnitSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid unit data", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: "2",
      bathrooms: "1.5",
      monthlyRentDollars: "1500",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(2);
      expect(result.data.bathrooms).toBe(1.5);
      expect(result.data.monthlyRentDollars).toBe(1500);
    }
  });

  it("coerces string numbers to numeric types", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "1A",
      bedrooms: "3",
      bathrooms: "2",
      monthlyRentDollars: "2000.50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.bedrooms).toBe("number");
      expect(typeof result.data.monthlyRentDollars).toBe("number");
    }
  });

  it("rejects non-UUID property ID", () => {
    const result = createUnitSchema.safeParse({
      propertyId: "not-a-uuid",
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative bedrooms", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: -1,
      bathrooms: 1,
      monthlyRentDollars: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero rent", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 0,
    });
    expect(result.success).toBe(false);
  });
});

/* ─── createLeaseSchema ─── */
describe("createLeaseSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";
  const validLease = {
    unitId: validUUID,
    tenantProfileId: validUUID,
    startDate: "2025-01-01",
    endDate: "2026-01-01",
    dueDayOfMonth: "1",
    monthlyRentDollars: "1500",
    depositDollars: "3000",
  };

  it("accepts valid lease data", () => {
    const result = createLeaseSchema.safeParse(validLease);
    expect(result.success).toBe(true);
  });

  it("rejects end date before start date", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      startDate: "2026-01-01",
      endDate: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects due day > 28", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      dueDayOfMonth: "31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects due day < 1", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      dueDayOfMonth: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative deposit", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      depositDollars: "-100",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── payChargeSchema ─── */
describe("payChargeSchema", () => {
  it("accepts a valid UUID", () => {
    const result = payChargeSchema.safeParse({
      chargeId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    const result = payChargeSchema.safeParse({
      chargeId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── createMaintenanceTicketSchema ─── */
describe("createMaintenanceTicketSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";
  const validTicket = {
    unitId: validUUID,
    title: "Leaking faucet in kitchen",
    description: "The kitchen faucet has been dripping steadily for two days.",
    priority: "medium",
  };

  it("accepts valid ticket data", () => {
    const result = createMaintenanceTicketSchema.safeParse(validTicket);
    expect(result.success).toBe(true);
  });

  it("accepts all priority levels", () => {
    for (const priority of ["low", "medium", "high", "urgent"]) {
      const result = createMaintenanceTicketSchema.safeParse({
        ...validTicket,
        priority,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid priority", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      priority: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title over 200 characters", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      title: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description over 2000 characters", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      description: "B".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID unit ID", () => {
    const result = createMaintenanceTicketSchema.safeParse({
      ...validTicket,
      unitId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── updateTicketStatusSchema ─── */
describe("updateTicketStatusSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts all valid statuses", () => {
    for (const status of ["open", "in_progress", "resolved", "closed"]) {
      const result = updateTicketStatusSchema.safeParse({
        ticketId: validUUID,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = updateTicketStatusSchema.safeParse({
      ticketId: validUUID,
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID ticket ID", () => {
    const result = updateTicketStatusSchema.safeParse({
      ticketId: "bad-id",
      status: "open",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── updateTicketCostSchema ─── */
describe("updateTicketCostSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid cost data", () => {
    const result = updateTicketCostSchema.safeParse({
      ticketId: validUUID,
      actualCostDollars: "250.50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actualCostDollars).toBe(250.5);
    }
  });

  it("accepts zero cost", () => {
    const result = updateTicketCostSchema.safeParse({
      ticketId: validUUID,
      actualCostDollars: "0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative cost", () => {
    const result = updateTicketCostSchema.safeParse({
      ticketId: validUUID,
      actualCostDollars: "-50",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID ticket ID", () => {
    const result = updateTicketCostSchema.safeParse({
      ticketId: "invalid",
      actualCostDollars: "100",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── inviteTenantSchema ─── */
describe("inviteTenantSchema", () => {
  it("accepts valid tenant invite data", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "John Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = inviteTenantSchema.safeParse({
      email: "",
      fullName: "John Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = inviteTenantSchema.safeParse({
      email: "not-an-email",
      fullName: "John Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty full name", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

/* ─── inviteManagerSchema ─── */
describe("inviteManagerSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid manager invite data", () => {
    const result = inviteManagerSchema.safeParse({
      email: "manager@example.com",
      fullName: "Jane Manager",
      propertyId: validUUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing property ID", () => {
    const result = inviteManagerSchema.safeParse({
      email: "manager@example.com",
      fullName: "Jane Manager",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID property ID", () => {
    const result = inviteManagerSchema.safeParse({
      email: "manager@example.com",
      fullName: "Jane Manager",
      propertyId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = inviteManagerSchema.safeParse({
      email: "bad",
      fullName: "Jane Manager",
      propertyId: validUUID,
    });
    expect(result.success).toBe(false);
  });
});

/* ─── resendInviteSchema ─── */
describe("resendInviteSchema", () => {
  it("accepts a valid UUID", () => {
    const result = resendInviteSchema.safeParse({
      invitationId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    const result = resendInviteSchema.safeParse({
      invitationId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});

/* ─── Document schemas ─── */
describe("createDocumentTemplateSchema", () => {
  it("accepts valid template data", () => {
    const result = createDocumentTemplateSchema.safeParse({
      name: "Lease Addendum",
      category: "Lease",
      bodyMarkdown: "## Terms"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = createDocumentTemplateSchema.safeParse({
      name: "Lease Addendum",
      category: "Lease",
      bodyMarkdown: ""
    });
    expect(result.success).toBe(false);
  });
});

describe("createDocumentPacketSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid packet payload", () => {
    const result = createDocumentPacketSchema.safeParse({
      templateId: validUUID,
      leaseId: validUUID
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID fields", () => {
    const result = createDocumentPacketSchema.safeParse({
      templateId: "bad",
      leaseId: "bad"
    });
    expect(result.success).toBe(false);
  });
});

describe("sendDocumentPacketSchema", () => {
  it("accepts packet ID", () => {
    const result = sendDocumentPacketSchema.safeParse({
      packetId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });
});

describe("signDocumentPacketSchema", () => {
  it("accepts valid signer input", () => {
    const result = signDocumentPacketSchema.safeParse({
      packetId: "550e8400-e29b-41d4-a716-446655440000",
      signatureText: "Jane Tenant"
    });
    expect(result.success).toBe(true);
  });

  it("rejects short signature", () => {
    const result = signDocumentPacketSchema.safeParse({
      packetId: "550e8400-e29b-41d4-a716-446655440000",
      signatureText: "J"
    });
    expect(result.success).toBe(false);
  });
});

/* ─── Notifications ─── */
describe("markNotificationReadSchema", () => {
  it("accepts valid notification ID", () => {
    const result = markNotificationReadSchema.safeParse({
      notificationId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });
});

/* ─── Vendors + Maintenance completion ─── */
describe("createVendorSchema", () => {
  it("accepts valid vendor payload", () => {
    const result = createVendorSchema.safeParse({
      name: "Rapid Plumbing",
      email: "ops@rapidplumbing.com",
      phone: "555-333-1111",
      tradeCategory: "plumbing",
      preferred: "true"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createVendorSchema.safeParse({
      name: ""
    });
    expect(result.success).toBe(false);
  });
});

describe("updateVendorSchema", () => {
  it("accepts valid vendor update payload", () => {
    const result = updateVendorSchema.safeParse({
      vendorId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Rapid Plumbing",
      email: "ops@rapidplumbing.com",
      phone: "555-333-1111",
      tradeCategory: "plumbing",
      preferred: "false"
    });
    expect(result.success).toBe(true);
  });
});

describe("assignVendorSchema", () => {
  it("accepts valid assignment payload", () => {
    const result = assignVendorSchema.safeParse({
      ticketId: "550e8400-e29b-41d4-a716-446655440000",
      vendorId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });
});

describe("uploadMaintenancePhotoSchema", () => {
  it("accepts valid photo metadata payload", () => {
    const result = uploadMaintenancePhotoSchema.safeParse({
      ticketId: "550e8400-e29b-41d4-a716-446655440000",
      caption: "After repair"
    });
    expect(result.success).toBe(true);
  });
});

describe("property file schemas", () => {
  it("accepts property file upload payload", () => {
    const result = uploadPropertyFileSchema.safeParse({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      category: "inspection",
      visibility: "all",
      description: "Move-in photo set"
    });
    expect(result.success).toBe(true);
  });

  it("accepts property file delete payload", () => {
    const result = deletePropertyFileSchema.safeParse({
      fileId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });

  it("accepts property file visibility payload", () => {
    const result = updateFileVisibilitySchema.safeParse({
      fileId: "550e8400-e29b-41d4-a716-446655440000",
      visibility: "owner_manager"
    });
    expect(result.success).toBe(true);
  });
});

describe("expense schemas", () => {
  const baseExpense = {
    propertyId: "550e8400-e29b-41d4-a716-446655440000",
    category: "maintenance",
    amountDollars: "120.50",
    expenseDate: "2026-03-01",
    recurring: "false",
    recurringFrequency: "",
    vendorId: "",
    receiptFileId: ""
  };

  it("accepts valid create expense payload", () => {
    const result = createExpenseSchema.safeParse(baseExpense);
    expect(result.success).toBe(true);
  });

  it("requires frequency for recurring expenses", () => {
    const result = createExpenseSchema.safeParse({
      ...baseExpense,
      recurring: "true",
      recurringFrequency: ""
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid update expense payload", () => {
    const result = updateExpenseSchema.safeParse({
      ...baseExpense,
      expenseId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid delete expense payload", () => {
    const result = deleteExpenseSchema.safeParse({
      expenseId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });
});

describe("tester access schemas", () => {
  it("accepts valid tester grant payload", () => {
    const result = grantTesterAccessSchema.safeParse({
      email: "tester.user@example.com"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid tester grant email", () => {
    const result = grantTesterAccessSchema.safeParse({
      email: "not-an-email"
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid tester revoke payload", () => {
    const result = revokeTesterAccessSchema.safeParse({
      profileId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });
});

/* ─── parseFormData helper ─── */
describe("parseFormData", () => {
  function makeFormData(entries: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      fd.append(key, value);
    }
    return fd;
  }

  it("parses valid form data against a schema", () => {
    const fd = makeFormData({
      name: "Sunset Apartments",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sunset Apartments");
      expect(result.data.postalCode).toBe("62701");
    }
  });

  it("trims whitespace from string values", () => {
    const fd = makeFormData({
      name: "  Sunset Apartments  ",
      addressLine1: " 123 Main St ",
      city: " Springfield ",
      state: " IL ",
      postalCode: " 62701 ",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sunset Apartments");
      expect(result.data.city).toBe("Springfield");
    }
  });

  it("returns first error message on invalid data", () => {
    const fd = makeFormData({
      name: "",
      addressLine1: "123 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
    });

    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Property name is required.");
    }
  });

  it("returns error for completely empty form data", () => {
    const fd = makeFormData({});
    const result = parseFormData(createPropertySchema, fd);
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings in unit schema", () => {
    const fd = makeFormData({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      unitNumber: "3C",
      bedrooms: "2",
      bathrooms: "1.5",
      monthlyRentDollars: "1200.00",
    });

    const result = parseFormData(createUnitSchema, fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bedrooms).toBe(2);
      expect(result.data.bathrooms).toBe(1.5);
      expect(result.data.monthlyRentDollars).toBe(1200);
    }
  });
});
