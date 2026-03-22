import { describe, it, expect } from "vitest";
import {
  createPropertySchema,
  createUnitSchema,
  createLeaseSchema,
  updateLeaseSchema,
  renewLeaseSchema,
  terminateLeaseSchema,
  renamePropertySchema,
  payChargeSchema,
  deletePendingChargeSchema,
  recordManualPaymentSchema,
  setupAutopaySchema,
  disableAutopaySchema,
  updateManagementFeeSchema,
  updateUnitFieldSchema,
  createMaintenanceTicketSchema,
  updateTicketStatusSchema,
  updateTicketCostSchema,
  inviteTenantSchema,
  inviteManagerSchema,
  resendInviteSchema,
  revokeInviteSchema,
  createDocumentTemplateSchema,
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  markNotificationReadSchema,
  completeOnboardingSchema,
  updateProfileSchema,
  uploadAvatarSchema,
  enableAutomationSchema,
  disableAutomationSchema,
  createInboxThreadSchema,
  sendInboxMessageSchema,
  createRentalListingSchema,
  updateListingStatusSchema,
  createApplicationSchema,
  reviewApplicationSchema,
  addApplicationNoteSchema,
  recordScreeningScoreSchema,
  createVendorSchema,
  updateVendorSchema,
  assignVendorSchema,
  deleteMaintenancePhotoSchema,
  uploadMaintenancePhotoSchema,
  uploadPropertyFileSchema,
  deletePropertyFileSchema,
  updateFileVisibilitySchema,
  createExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  setupLlcAccountSchema,
  joinLlcByCodeSchema,
  renameOwnershipAccountSchema,
  requestDeleteLlcSchema,
  voteOnAccountRenameSchema,
  voteOnDeleteLlcSchema,
  sendBatchPaymentReminderSchema,
  setupManagerPaymentConfigSchema,
  recordManagerPaymentSchema,
  updateManagerPaymentStatusSchema,
  generateManagerPaymentsSchema,
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
    expect(result.success).toBe(true);
  });

  it("accepts blank optional address fields", () => {
    const result = createPropertySchema.safeParse({
      name: "Sunset Apartments",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: ""
    });
    expect(result.success).toBe(true);
  });
});

describe("account governance schemas", () => {
  it("accepts a valid ownership account rename", () => {
    const result = renameOwnershipAccountSchema.safeParse({
      accountId: "550e8400-e29b-41d4-a716-446655440000",
      newName: "Atlas Family LLC"
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty rename target", () => {
    const result = renameOwnershipAccountSchema.safeParse({
      accountId: "550e8400-e29b-41d4-a716-446655440000",
      newName: ""
    });
    expect(result.success).toBe(false);
  });

  it("accepts an LLC delete request with an optional reason", () => {
    const result = requestDeleteLlcSchema.safeParse({
      accountId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Wind down the entity"
    });
    expect(result.success).toBe(true);
  });

  it("accepts approve and reject governance votes", () => {
    expect(
      voteOnAccountRenameSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        vote: "approve"
      }).success
    ).toBe(true);
    expect(
      voteOnDeleteLlcSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        vote: "reject"
      }).success
    ).toBe(true);
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

  it("accepts zero rent for placeholder unit setup flows", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional square footage", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: 2,
      bathrooms: 1,
      monthlyRentDollars: 1500,
      squareFeet: 980
    });
    expect(result.success).toBe(true);
  });
});

describe("manager payment schemas", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts a percentage-based recurring manager payment config", () => {
    const result = setupManagerPaymentConfigSchema.safeParse({
      propertyId: validUUID,
      managerProfileId: validUUID,
      paymentType: "percentage",
      percentageRate: "9.00",
      baseRentDollars: "2350.00",
      label: "Property Management Fee",
      frequency: "monthly"
    });

    expect(result.success).toBe(true);
  });

  it("accepts a flat recurring manager payment config", () => {
    const result = setupManagerPaymentConfigSchema.safeParse({
      propertyId: validUUID,
      managerProfileId: validUUID,
      paymentType: "flat",
      flatAmountDollars: "500.00",
      label: "Flat Management Fee",
      frequency: "monthly"
    });

    expect(result.success).toBe(true);
  });

  it("rejects configs without a matching amount input", () => {
    const result = setupManagerPaymentConfigSchema.safeParse({
      propertyId: validUUID,
      managerProfileId: validUUID,
      paymentType: "percentage",
      label: "Missing Rate",
      frequency: "monthly"
    });

    expect(result.success).toBe(false);
  });

  it("accepts reimbursement and custom manager payments", () => {
    expect(
      recordManagerPaymentSchema.safeParse({
        propertyId: validUUID,
        managerProfileId: validUUID,
        category: "reimbursement",
        description: "Emergency lock replacement",
        amountDollars: "75.50",
        notes: "Paid out of pocket."
      }).success
    ).toBe(true);

    expect(
      recordManagerPaymentSchema.safeParse({
        propertyId: validUUID,
        managerProfileId: validUUID,
        category: "custom",
        description: "Monthly inspection bonus",
        amountDollars: "125.00"
      }).success
    ).toBe(true);
  });

  it("accepts payment status updates and optional generation filters", () => {
    expect(
      updateManagerPaymentStatusSchema.safeParse({
        paymentId: validUUID,
        status: "paid"
      }).success
    ).toBe(true);

    expect(generateManagerPaymentsSchema.safeParse({ propertyId: validUUID }).success).toBe(true);
    expect(generateManagerPaymentsSchema.safeParse({ propertyId: "" }).success).toBe(true);
  });
});

describe("inline edit action schemas", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts a valid property rename", () => {
    const result = renamePropertySchema.safeParse({
      propertyId: validUUID,
      name: "Atlas House"
    });

    expect(result.success).toBe(true);
  });

  it("accepts unit field updates for labels and rent", () => {
    expect(
      updateUnitFieldSchema.safeParse({
        unitId: validUUID,
        field: "unitNumber",
        value: "2B"
      }).success
    ).toBe(true);

    expect(
      updateUnitFieldSchema.safeParse({
        unitId: validUUID,
        field: "monthlyRentDollars",
        value: "1650.50"
      }).success
    ).toBe(true);
  });

  it("rejects invalid batch reminder payloads", () => {
    expect(
      sendBatchPaymentReminderSchema.safeParse({
        chargeIds: []
      }).success
    ).toBe(false);

    expect(
      sendBatchPaymentReminderSchema.safeParse({
        chargeIds: [validUUID]
      }).success
    ).toBe(true);
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

  it("accepts grace period + late fee fields", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      gracePeriodDays: "5",
      lateFeeDollars: "50"
    });
    expect(result.success).toBe(true);
  });

  it("accepts lease without grace/late fields", () => {
    const result = createLeaseSchema.safeParse(validLease);
    expect(result.success).toBe(true);
  });

  it("rejects grace period above 30", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      gracePeriodDays: "31"
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative late fee", () => {
    const result = createLeaseSchema.safeParse({
      ...validLease,
      lateFeeDollars: "-5"
    });
    expect(result.success).toBe(false);
  });
});

describe("updateLeaseSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid update payload with grace and late fee", () => {
    const result = updateLeaseSchema.safeParse({
      leaseId: validUUID,
      endDate: "2026-01-01",
      dueDayOfMonth: "1",
      monthlyRentDollars: "1500",
      depositDollars: "2000",
      gracePeriodDays: "5",
      lateFeeDollars: "50"
    });
    expect(result.success).toBe(true);
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

describe("recordManualPaymentSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid manual payment payload", () => {
    const result = recordManualPaymentSchema.safeParse({
      chargeId: validUUID,
      amountDollars: "1500",
      method: "cash"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing chargeId", () => {
    const result = recordManualPaymentSchema.safeParse({
      amountDollars: "1500",
      method: "cash"
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = recordManualPaymentSchema.safeParse({
      chargeId: validUUID,
      amountDollars: "0",
      method: "cash"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid method", () => {
    const result = recordManualPaymentSchema.safeParse({
      chargeId: validUUID,
      amountDollars: "1500",
      method: "bitcoin"
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional reference note", () => {
    const result = recordManualPaymentSchema.safeParse({
      chargeId: validUUID,
      amountDollars: "1500",
      method: "check",
      referenceNote: "Check #1042"
    });
    expect(result.success).toBe(true);
  });
});

describe("deletePendingChargeSchema", () => {
  it("accepts a valid charge ID", () => {
    const result = deletePendingChargeSchema.safeParse({
      chargeId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid charge ID", () => {
    const result = deletePendingChargeSchema.safeParse({
      chargeId: "not-a-charge-id"
    });

    expect(result.success).toBe(false);
  });
});

describe("setupAutopaySchema", () => {
  it("accepts a valid lease ID", () => {
    const result = setupAutopaySchema.safeParse({
      leaseId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid lease IDs", () => {
    const result = setupAutopaySchema.safeParse({
      leaseId: "not-a-uuid"
    });
    expect(result.success).toBe(false);
  });
});

describe("disableAutopaySchema", () => {
  it("accepts a valid enrollment ID", () => {
    const result = disableAutopaySchema.safeParse({
      enrollmentId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid enrollment IDs", () => {
    const result = disableAutopaySchema.safeParse({
      enrollmentId: "not-a-uuid"
    });
    expect(result.success).toBe(false);
  });
});

describe("updateManagementFeeSchema", () => {
  it("accepts valid management fee data", () => {
    const result = updateManagementFeeSchema.safeParse({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      managementFeeDollars: "125.50"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid property IDs", () => {
    const result = updateManagementFeeSchema.safeParse({
      propertyId: "bad-id",
      managementFeeDollars: "125"
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative management fees", () => {
    const result = updateManagementFeeSchema.safeParse({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      managementFeeDollars: "-1"
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
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid tenant invite data", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "John Doe",
      propertyId: validUUID,
      unitId: validUUID,
      phone: "555-1212",
      monthlyRentDollars: "1850",
      leaseStartDate: "2026-04-01",
      leaseEndDate: "2027-03-31"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = inviteTenantSchema.safeParse({
      email: "",
      fullName: "John Doe",
      propertyId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = inviteTenantSchema.safeParse({
      email: "not-an-email",
      fullName: "John Doe",
      propertyId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty full name", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "",
      propertyId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "A".repeat(101),
      propertyId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing property", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "John Doe"
    });
    expect(result.success).toBe(false);
  });

  it("accepts blank optional tenant invite fields", () => {
    const result = inviteTenantSchema.safeParse({
      email: "tenant@example.com",
      fullName: "John Doe",
      propertyId: validUUID,
      unitId: "",
      phone: "",
      monthlyRentDollars: "",
      leaseStartDate: "",
      leaseEndDate: ""
    });
    expect(result.success).toBe(true);
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

describe("revokeInviteSchema", () => {
  it("accepts a valid UUID", () => {
    const result = revokeInviteSchema.safeParse({
      invitationId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    const result = revokeInviteSchema.safeParse({
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

describe("profile schemas", () => {
  const validAvatar = new File(["avatar"], "avatar.png", { type: "image/png" });
  const oversizedAvatar = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
    type: "image/png"
  });
  const invalidAvatar = new File(["avatar"], "avatar.gif", { type: "image/gif" });

  it("accepts complete onboarding fields with optional avatar", () => {
    const result = completeOnboardingSchema.safeParse({
      firstName: "Courtney",
      lastName: "Smith",
      nickname: "Court",
      avatarFile: validAvatar
    });
    expect(result.success).toBe(true);
  });

  it("rejects onboarding without first name", () => {
    const result = completeOnboardingSchema.safeParse({
      firstName: "",
      lastName: "Smith"
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized onboarding avatar", () => {
    const result = completeOnboardingSchema.safeParse({
      firstName: "Courtney",
      lastName: "Smith",
      avatarFile: oversizedAvatar
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported onboarding avatar format", () => {
    const result = completeOnboardingSchema.safeParse({
      firstName: "Courtney",
      lastName: "Smith",
      avatarFile: invalidAvatar
    });
    expect(result.success).toBe(false);
  });

  it("accepts profile updates without nickname or avatar", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Courtney",
      lastName: "Smith",
      nickname: ""
    });
    expect(result.success).toBe(true);
  });

  it("rejects profile update without last name", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Courtney",
      lastName: ""
    });
    expect(result.success).toBe(false);
  });

  it("requires an avatar for uploadAvatarSchema", () => {
    const result = uploadAvatarSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a valid avatar upload", () => {
    const result = uploadAvatarSchema.safeParse({
      avatarFile: validAvatar
    });
    expect(result.success).toBe(true);
  });
});

describe("enableAutomationSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid automation enable payload", () => {
    const result = enableAutomationSchema.safeParse({
      propertyId: validUUID,
      templateId: validUUID
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid property ID", () => {
    const result = enableAutomationSchema.safeParse({
      propertyId: "bad-id",
      templateId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid template ID", () => {
    const result = enableAutomationSchema.safeParse({
      propertyId: validUUID,
      templateId: "bad-id"
    });
    expect(result.success).toBe(false);
  });
});

describe("disableAutomationSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid automation disable payload", () => {
    const result = disableAutomationSchema.safeParse({
      propertyId: validUUID,
      templateId: validUUID
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid property ID", () => {
    const result = disableAutomationSchema.safeParse({
      propertyId: "bad-id",
      templateId: validUUID
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid template ID", () => {
    const result = disableAutomationSchema.safeParse({
      propertyId: validUUID,
      templateId: "bad-id"
    });
    expect(result.success).toBe(false);
  });
});

describe("createInboxThreadSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid inbox thread payload", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: validUUID,
      subject: "Lease renewal follow-up",
      entityType: "lease",
      entityId: validUUID
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty entity ID", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: validUUID,
      subject: "General operations",
      entityType: "general",
      entityId: ""
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid property ID", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: "bad-id",
      subject: "General operations",
      entityType: "general"
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty subject", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: validUUID,
      subject: "",
      entityType: "general"
    });
    expect(result.success).toBe(false);
  });

  it("rejects subject over 180 chars", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: validUUID,
      subject: "A".repeat(181),
      entityType: "general"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entity ID", () => {
    const result = createInboxThreadSchema.safeParse({
      propertyId: validUUID,
      subject: "Lease thread",
      entityType: "lease",
      entityId: "bad-id"
    });
    expect(result.success).toBe(false);
  });
});

describe("sendInboxMessageSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid inbox message payload", () => {
    const result = sendInboxMessageSchema.safeParse({
      threadId: validUUID,
      body: "Please confirm access for the vendor tomorrow morning."
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid thread ID", () => {
    const result = sendInboxMessageSchema.safeParse({
      threadId: "bad-id",
      body: "Message"
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty message body", () => {
    const result = sendInboxMessageSchema.safeParse({
      threadId: validUUID,
      body: ""
    });
    expect(result.success).toBe(false);
  });

  it("rejects message over 4000 chars", () => {
    const result = sendInboxMessageSchema.safeParse({
      threadId: validUUID,
      body: "B".repeat(4001)
    });
    expect(result.success).toBe(false);
  });
});

describe("createRentalListingSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid rental listing payload", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: validUUID,
      headline: "Updated 2BR with garage access",
      description: "Fresh paint and in-unit laundry.",
      askingRentDollars: "1895",
      availableOn: "2026-04-01",
      bedroomCount: "2",
      bathroomCount: "1.5"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid property ID", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: "bad-id",
      headline: "Listing",
      askingRentDollars: "1800"
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty headline", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: validUUID,
      headline: "",
      askingRentDollars: "1800"
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive asking rent", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: validUUID,
      headline: "Listing",
      askingRentDollars: "0"
    });
    expect(result.success).toBe(false);
  });

  it("rejects bedroom count over max", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: validUUID,
      headline: "Listing",
      askingRentDollars: "1800",
      bedroomCount: "51"
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative bathroom count", () => {
    const result = createRentalListingSchema.safeParse({
      propertyId: validUUID,
      headline: "Listing",
      askingRentDollars: "1800",
      bathroomCount: "-1"
    });
    expect(result.success).toBe(false);
  });
});

describe("updateListingStatusSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts all valid listing statuses", () => {
    for (const status of ["draft", "published", "paused", "archived"]) {
      const result = updateListingStatusSchema.safeParse({
        listingId: validUUID,
        status
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid listing ID", () => {
    const result = updateListingStatusSchema.safeParse({
      listingId: "bad-id",
      status: "draft"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid listing status", () => {
    const result = updateListingStatusSchema.safeParse({
      listingId: validUUID,
      status: "live"
    });
    expect(result.success).toBe(false);
  });
});

describe("Application schemas", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  describe("createApplicationSchema", () => {
    it("accepts valid input", () => {
      const result = createApplicationSchema.safeParse({
        listingId: validUUID,
        propertyId: validUUID,
        applicantEmail: "applicant@example.com",
        applicantName: "Taylor Applicant",
        applicantPhone: "555-111-2222",
        source: "zillow",
        notes: "Strong references"
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing applicant email", () => {
      const result = createApplicationSchema.safeParse({
        listingId: validUUID,
        propertyId: validUUID,
        applicantEmail: ""
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid listing UUID", () => {
      const result = createApplicationSchema.safeParse({
        listingId: "bad-id",
        propertyId: validUUID,
        applicantEmail: "applicant@example.com"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid property UUID", () => {
      const result = createApplicationSchema.safeParse({
        listingId: validUUID,
        propertyId: "bad-id",
        applicantEmail: "applicant@example.com"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid applicant email", () => {
      const result = createApplicationSchema.safeParse({
        listingId: validUUID,
        propertyId: validUUID,
        applicantEmail: "not-an-email"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reviewApplicationSchema", () => {
    it("accepts valid review payload", () => {
      const result = reviewApplicationSchema.safeParse({
        applicationId: validUUID,
        status: "approved",
        notes: "All checks passed."
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = reviewApplicationSchema.safeParse({
        applicationId: validUUID,
        status: "pending"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid application ID", () => {
      const result = reviewApplicationSchema.safeParse({
        applicationId: "bad-id",
        status: "in_review"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("addApplicationNoteSchema", () => {
    it("accepts valid note payload", () => {
      const result = addApplicationNoteSchema.safeParse({
        applicationId: validUUID,
        message: "Applicant requested move-in flexibility."
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty message", () => {
      const result = addApplicationNoteSchema.safeParse({
        applicationId: validUUID,
        message: ""
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid application ID", () => {
      const result = addApplicationNoteSchema.safeParse({
        applicationId: "bad-id",
        message: "Hello"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("recordScreeningScoreSchema", () => {
    it("accepts valid score payload", () => {
      const result = recordScreeningScoreSchema.safeParse({
        applicationId: validUUID,
        score: "720",
        summary: "No eviction history."
      });
      expect(result.success).toBe(true);
    });

    it("rejects score above max", () => {
      const result = recordScreeningScoreSchema.safeParse({
        applicationId: validUUID,
        score: "1001"
      });
      expect(result.success).toBe(false);
    });

    it("rejects score below min", () => {
      const result = recordScreeningScoreSchema.safeParse({
        applicationId: validUUID,
        score: "-1"
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer score", () => {
      const result = recordScreeningScoreSchema.safeParse({
        applicationId: validUUID,
        score: "700.5"
      });
      expect(result.success).toBe(false);
    });
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

describe("deleteMaintenancePhotoSchema", () => {
  it("accepts a valid maintenance photo delete payload", () => {
    const result = deleteMaintenancePhotoSchema.safeParse({
      photoId: "550e8400-e29b-41d4-a716-446655440000"
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

describe("owner onboarding schemas", () => {
  it("accepts valid LLC setup payload", () => {
    const result = setupLlcAccountSchema.safeParse({
      displayName: "Smith Family Holdings LLC"
    });
    expect(result.success).toBe(true);
  });

  it("rejects LLC names that are too short", () => {
    const result = setupLlcAccountSchema.safeParse({
      displayName: "A"
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid LLC join code payload", () => {
    const result = joinLlcByCodeSchema.safeParse({
      joinCode: "ABC123"
    });
    expect(result.success).toBe(true);
  });

  it("rejects LLC join codes that are not 6 characters", () => {
    const result = joinLlcByCodeSchema.safeParse({
      joinCode: "ABC12"
    });
    expect(result.success).toBe(false);
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

describe("lease validation edge cases", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("rejects zero rent amount on createLeaseSchema", () => {
    const result = createLeaseSchema.safeParse({
      unitId: validUUID,
      tenantProfileId: validUUID,
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      dueDayOfMonth: "5",
      monthlyRentDollars: "0",
      depositDollars: "500"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a minimum one-month lease term", () => {
    const result = createLeaseSchema.safeParse({
      unitId: validUUID,
      tenantProfileId: validUUID,
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      dueDayOfMonth: "1",
      monthlyRentDollars: "1200",
      depositDollars: "0"
    });

    expect(result.success).toBe(true);
  });

  it("applies default grace period and late fee values", () => {
    const result = createLeaseSchema.safeParse({
      unitId: validUUID,
      tenantProfileId: validUUID,
      startDate: "2026-01-01",
      endDate: "2026-03-01",
      dueDayOfMonth: "10",
      monthlyRentDollars: "1500",
      depositDollars: "1000"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gracePeriodDays).toBe(5);
      expect(result.data.lateFeeDollars).toBe(0);
    }
  });

  it("accepts zero grace period days", () => {
    const result = createLeaseSchema.safeParse({
      unitId: validUUID,
      tenantProfileId: validUUID,
      startDate: "2026-01-01",
      endDate: "2026-03-01",
      dueDayOfMonth: "10",
      monthlyRentDollars: "1500",
      depositDollars: "1000",
      gracePeriodDays: "0"
    });

    expect(result.success).toBe(true);
  });

  it("accepts zero late fee dollars", () => {
    const result = createLeaseSchema.safeParse({
      unitId: validUUID,
      tenantProfileId: validUUID,
      startDate: "2026-01-01",
      endDate: "2026-03-01",
      dueDayOfMonth: "10",
      monthlyRentDollars: "1500",
      depositDollars: "1000",
      lateFeeDollars: "0"
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero monthly rent on updateLeaseSchema", () => {
    const result = updateLeaseSchema.safeParse({
      leaseId: validUUID,
      endDate: "2026-12-31",
      dueDayOfMonth: "1",
      monthlyRentDollars: "0",
      depositDollars: "500"
    });

    expect(result.success).toBe(false);
  });

  it("applies default late fee values on updateLeaseSchema", () => {
    const result = updateLeaseSchema.safeParse({
      leaseId: validUUID,
      endDate: "2026-12-31",
      dueDayOfMonth: "1",
      monthlyRentDollars: "1500",
      depositDollars: "500"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gracePeriodDays).toBe(5);
      expect(result.data.lateFeeDollars).toBe(0);
    }
  });

  it("rejects renewals where the end date precedes the new start date", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUUID,
      newStartDate: "2026-06-01",
      newEndDate: "2026-05-31",
      newMonthlyRentDollars: "1600",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid lease renewal payloads", () => {
    const result = renewLeaseSchema.safeParse({
      leaseId: validUUID,
      newStartDate: "2026-06-01",
      newEndDate: "2027-05-31",
      newMonthlyRentDollars: "1600",
      newDueDayOfMonth: "1"
    });

    expect(result.success).toBe(true);
  });

  it("rejects termination reasons longer than 500 characters", () => {
    const result = terminateLeaseSchema.safeParse({
      leaseId: validUUID,
      terminationReason: "x".repeat(501)
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid late fee updates", () => {
    const result = updateLeaseSchema.safeParse({
      leaseId: validUUID,
      endDate: "2027-05-31",
      dueDayOfMonth: "1",
      monthlyRentDollars: "1600",
      depositDollars: "500",
      lateFeeDollars: "75",
      gracePeriodDays: "5"
    });

    expect(result.success).toBe(true);
  });

  it("rejects late fee updates above the grace period bounds", () => {
    const result = updateLeaseSchema.safeParse({
      leaseId: validUUID,
      endDate: "2027-05-31",
      dueDayOfMonth: "1",
      monthlyRentDollars: "1600",
      depositDollars: "500",
      lateFeeDollars: "75",
      gracePeriodDays: "31"
    });

    expect(result.success).toBe(false);
  });
});

describe("property validation edge cases", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts property records with only a name", () => {
    const result = createPropertySchema.safeParse({ name: "Atlas" });
    expect(result.success).toBe(true);
  });

  it("normalizes blank postal codes to undefined", () => {
    const result = createPropertySchema.safeParse({
      name: "Atlas",
      postalCode: ""
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postalCode).toBeUndefined();
    }
  });

  it("rejects postal codes with special characters", () => {
    const result = createPropertySchema.safeParse({
      name: "Atlas",
      postalCode: "6270!"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid owner account id", () => {
    const result = createPropertySchema.safeParse({
      name: "Atlas",
      ownerAccountId: validUUID
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid owner account id", () => {
    const result = createPropertySchema.safeParse({
      name: "Atlas",
      ownerAccountId: "not-a-uuid"
    });

    expect(result.success).toBe(false);
  });
});

describe("unit and expense validation edge cases", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("rejects empty unit numbers", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "",
      bedrooms: "1",
      bathrooms: "1",
      monthlyRentDollars: "1000"
    });

    expect(result.success).toBe(false);
  });

  it("accepts alphanumeric unit numbers", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "PH-2B",
      bedrooms: "2",
      bathrooms: "1.5",
      monthlyRentDollars: "2200"
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative bathroom counts", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "2B",
      bedrooms: "2",
      bathrooms: "-1",
      monthlyRentDollars: "1500"
    });

    expect(result.success).toBe(false);
  });

  it("accepts studio units with zero bedrooms", () => {
    const result = createUnitSchema.safeParse({
      propertyId: validUUID,
      unitNumber: "Studio",
      bedrooms: "0",
      bathrooms: "1",
      monthlyRentDollars: "900"
    });

    expect(result.success).toBe(true);
  });

  it("rejects expense payloads with zero amounts", () => {
    const result = createExpenseSchema.safeParse({
      propertyId: validUUID,
      category: "maintenance",
      amountDollars: "0",
      expenseDate: "2026-03-01",
      recurring: "false"
    });

    expect(result.success).toBe(false);
  });

  it("rejects expense payloads without a category", () => {
    const result = createExpenseSchema.safeParse({
      propertyId: validUUID,
      amountDollars: "100",
      expenseDate: "2026-03-01",
      recurring: "false"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid recurring frequencies", () => {
    const result = createExpenseSchema.safeParse({
      propertyId: validUUID,
      category: "maintenance",
      amountDollars: "100",
      expenseDate: "2026-03-01",
      recurring: "true",
      recurringFrequency: "weekly"
    });

    expect(result.success).toBe(false);
  });

  it("accepts recurring expenses with a valid frequency", () => {
    const result = createExpenseSchema.safeParse({
      propertyId: validUUID,
      category: "maintenance",
      amountDollars: "100",
      expenseDate: "2026-03-01",
      recurring: "true",
      recurringFrequency: "monthly"
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid vendor ids on updateExpenseSchema", () => {
    const result = updateExpenseSchema.safeParse({
      expenseId: validUUID,
      category: "maintenance",
      amountDollars: "100",
      expenseDate: "2026-03-01",
      recurring: "false",
      vendorId: "nope"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid receipt file ids on updateExpenseSchema", () => {
    const result = updateExpenseSchema.safeParse({
      expenseId: validUUID,
      category: "maintenance",
      amountDollars: "100",
      expenseDate: "2026-03-01",
      recurring: "false",
      receiptFileId: "bad-id"
    });

    expect(result.success).toBe(false);
  });
});
