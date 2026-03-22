import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const sideEffectErrorMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/logger", () => ({ sideEffectError: sideEffectErrorMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createManualChargeSchema: {},
  deletePendingChargeSchema: {},
  editChargeSchema: {},
  updateLeaseRentAmountSchema: {},
  waiveChargeSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));

import {
  createManualCharge,
  deleteCharge,
  editCharge,
  updateLeaseRentAmount,
  waiveCharge
} from "@/app/actions/charge-management";
import { getChargeAuditSummary, isChargeEditableStatus, isChargeOutstanding } from "@/lib/charge-audit";

interface MockAdminConfig {
  charge?: Record<string, unknown> | null;
  lease?: Record<string, unknown> | null;
  unit?: Record<string, unknown> | null;
  rentChargeUpdateError?: { message?: string; code?: string } | null;
  chargeHistoryError?: { message?: string; code?: string } | null;
}

function createAdminMock(config: MockAdminConfig = {}) {
  const rentChargeInsertSingle = vi.fn().mockResolvedValue({ data: { id: "charge-new" }, error: null });
  const rentChargeInsertSelect = vi.fn(() => ({ single: rentChargeInsertSingle }));
  const rentChargeInsert = vi.fn(() => ({ select: rentChargeInsertSelect }));
  const rentChargeUpdateEq = vi.fn().mockResolvedValue({ error: config.rentChargeUpdateError ?? null });
  const rentChargeUpdate = vi.fn(() => ({ eq: rentChargeUpdateEq }));
  const rentChargeSelectMaybeSingle = vi.fn().mockResolvedValue({ data: config.charge ?? null, error: null });
  const rentChargeSelectSingle = vi.fn().mockResolvedValue({ data: config.charge ?? null, error: null });
  const rentChargeSelectBuilder = {
    eq: vi.fn(() => ({
      maybeSingle: rentChargeSelectMaybeSingle,
      single: rentChargeSelectSingle
    }))
  };
  const chargeHistoryInsert = vi.fn().mockResolvedValue({ error: config.chargeHistoryError ?? null });
  const leaseMaybeSingle = vi.fn().mockResolvedValue({ data: config.lease ?? null, error: null });
  const unitMaybeSingle = vi.fn().mockResolvedValue({ data: config.unit ?? null, error: null });
  const leaseUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const leaseUpdate = vi.fn(() => ({ eq: leaseUpdateEq }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === "rent_charges") {
        return {
          select: vi.fn(() => rentChargeSelectBuilder),
          update: rentChargeUpdate,
          insert: rentChargeInsert
        };
      }
      if (table === "charge_edit_history") {
        return {
          insert: chargeHistoryInsert
        };
      }
      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: leaseMaybeSingle
            }))
          })),
          update: leaseUpdate
        };
      }
      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: unitMaybeSingle
            }))
          }))
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          }))
        }))
      };
    })
  };

  return {
    client,
    rentChargeInsert,
    rentChargeInsertSingle,
    rentChargeUpdateEq,
    chargeHistoryInsert,
    leaseUpdateEq
  };
}

describe("charge management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
      role: "owner"
    });
    logAuditMock.mockResolvedValue(undefined);
  });

  it("editCharge updates changed fields and records audit history", async () => {
    const admin = createAdminMock({
      charge: {
        id: "charge-1",
        lease_id: "lease-1",
        due_date: "2026-04-01",
        amount_cents: 120000,
        status: "pending",
        category: "rent",
        notes: null,
        deleted_at: null
      },
      lease: { id: "lease-1", unit_id: "unit-1" },
      unit: { id: "unit-1", property_id: "property-1" }
    });
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1300,
        dueDate: "2026-04-05",
        category: "utility",
        status: "late",
        notes: "Utility back-bill",
        reason: "Correcting the utility charge."
      }
    });

    const result = await editCharge(null, new FormData());

    expect(result).toEqual({ success: true, message: "Charge updated." });
    expect(admin.rentChargeUpdateEq).toHaveBeenCalled();
    expect(admin.chargeHistoryInsert).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
  });

  it("editCharge rejects paid charges", async () => {
    createAdminClientMock.mockReturnValue(
      createAdminMock({
        charge: {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-04-01",
          amount_cents: 120000,
          status: "paid",
          category: "rent",
          deleted_at: null
        },
        lease: { id: "lease-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1" }
      }).client
    );
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1300,
        dueDate: "2026-04-05",
        category: "utility",
        status: "late",
        notes: "",
        reason: "Correction"
      }
    });

    const result = await editCharge(null, new FormData());

    expect(result).toEqual({ success: false, error: "Paid charges cannot be edited." });
  });

  it("deleteCharge soft-deletes a non-paid charge", async () => {
    const admin = createAdminMock({
      charge: {
        id: "charge-1",
        lease_id: "lease-1",
        due_date: "2026-04-01",
        amount_cents: 120000,
        status: "late",
        category: "rent",
        deleted_at: null
      },
      lease: { id: "lease-1", unit_id: "unit-1" },
      unit: { id: "unit-1", property_id: "property-1" }
    });
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { chargeId: "charge-1", reason: "Duplicate charge." }
    });

    const result = await deleteCharge(null, new FormData());

    expect(result).toEqual({ success: true, message: "Charge deleted." });
    expect(admin.rentChargeUpdateEq).toHaveBeenCalled();
    expect(admin.chargeHistoryInsert).toHaveBeenCalled();
  });

  it("deleteCharge rejects paid charges", async () => {
    createAdminClientMock.mockReturnValue(
      createAdminMock({
        charge: {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-04-01",
          amount_cents: 120000,
          status: "paid",
          category: "rent",
          deleted_at: null
        },
        lease: { id: "lease-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1" }
      }).client
    );
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { chargeId: "charge-1", reason: "Cleanup" }
    });

    const result = await deleteCharge(null, new FormData());

    expect(result).toEqual({ success: false, error: "Paid charges cannot be deleted." });
  });

  it("createManualCharge inserts a new pending charge", async () => {
    const admin = createAdminMock({
      lease: { id: "lease-1", unit_id: "unit-1" },
      unit: { id: "unit-1", property_id: "property-1" }
    });
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        leaseId: "lease-1",
        amountDollars: 75,
        dueDate: "2026-04-10",
        category: "key_replacement",
        notes: "Key replacement fee"
      }
    });

    const result = await createManualCharge(null, new FormData());

    expect(result).toEqual({ success: true, message: "Manual charge created." });
    expect(admin.rentChargeInsert).toHaveBeenCalled();
  });

  it("createManualCharge returns validation errors from parseFormData", async () => {
    parseFormDataMock.mockReturnValue({
      success: false,
      error: "Amount must be greater than $0."
    });

    const result = await createManualCharge(null, new FormData());

    expect(result).toEqual({ success: false, error: "Amount must be greater than $0." });
  });

  it("waiveCharge marks a charge as waived and records history", async () => {
    const admin = createAdminMock({
      charge: {
        id: "charge-1",
        lease_id: "lease-1",
        due_date: "2026-04-01",
        amount_cents: 120000,
        status: "pending",
        category: "rent",
        deleted_at: null
      },
      lease: { id: "lease-1", unit_id: "unit-1" },
      unit: { id: "unit-1", property_id: "property-1" }
    });
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { chargeId: "charge-1", reason: "Waived as courtesy." }
    });

    const result = await waiveCharge(null, new FormData());

    expect(result).toEqual({ success: true, message: "Charge waived." });
    expect(admin.rentChargeUpdateEq).toHaveBeenCalled();
    expect(admin.chargeHistoryInsert).toHaveBeenCalled();
  });

  it("updateLeaseRentAmount updates the monthly rent cents", async () => {
    const admin = createAdminMock({
      lease: { id: "lease-1", unit_id: "unit-1", monthly_rent_cents: 120000 },
      unit: { id: "unit-1", property_id: "property-1" }
    });
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { leaseId: "lease-1", monthlyRentDollars: 1350 }
    });

    const result = await updateLeaseRentAmount(null, new FormData());

    expect(result).toEqual({ success: true, message: "Recurring rent amount updated." });
    expect(admin.leaseUpdateEq).toHaveBeenCalled();
  });

  it("getChargeAuditSummary returns the latest edit metadata", () => {
    const summary = getChargeAuditSummary([
      {
        id: "h1",
        chargeId: "c1",
        editedBy: "u1",
        editedByName: "Ace Owner",
        fieldName: "amount_cents",
        oldValue: "120000",
        newValue: "130000",
        reason: "Correction",
        createdAt: "2026-03-20T10:00:00.000Z"
      },
      {
        id: "h2",
        chargeId: "c1",
        editedBy: "u2",
        editedByName: "PM Smith",
        fieldName: "status",
        oldValue: "pending",
        newValue: "late",
        reason: "Aging update",
        createdAt: "2026-03-21T10:00:00.000Z"
      }
    ]);

    expect(summary).toEqual({
      latestEditedAt: "2026-03-21T10:00:00.000Z",
      latestEditedByName: "PM Smith",
      editedCount: 2
    });
  });

  it("charge status helpers treat only pending and late as editable/outstanding", () => {
    expect(isChargeEditableStatus("pending")).toBe(true);
    expect(isChargeEditableStatus("late")).toBe(true);
    expect(isChargeEditableStatus("paid")).toBe(false);
    expect(isChargeOutstanding("waived")).toBe(false);
  });
});
