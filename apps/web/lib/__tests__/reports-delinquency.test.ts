import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChargeDetailRecordDTO } from "@/lib/charge-audit";

const createAdminClientMock = vi.hoisted(() => vi.fn());
const getLeasesForScopeMock = vi.hoisted(() => vi.fn());
const getChargeDetailsForLeasesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));
vi.mock("../reports-rent-roll", () => ({
  differenceInDays: (fromDate: string, toDate: string) =>
    Math.floor(
      (new Date(`${toDate}T00:00:00.000Z`).getTime() -
        new Date(`${fromDate}T00:00:00.000Z`).getTime()) /
        86400000
    ),
  getLeasesForScope: getLeasesForScopeMock,
  getChargeDetailsForLeases: getChargeDetailsForLeasesMock
}));

import { getDelinquencyReport, getReceivablesReport } from "../reports-delinquency";

function charge(leaseId: string, amountCents: number): ChargeDetailRecordDTO {
  return {
    id: `charge-${leaseId}`,
    leaseId,
    propertyId: "property-1",
    propertyName: "Domus House",
    unitNumber: leaseId,
    tenantProfileId: `tenant-${leaseId}`,
    tenantName: leaseId,
    tenantEmail: `${leaseId}@example.com`,
    dueDate: "2026-08-01",
    amountCents,
    status: "late",
    category: "rent",
    notes: null,
    latestEditedAt: null,
    latestEditedByName: null,
    editedCount: 0
  };
}

describe("delinquency report outside-Domus filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const leases = [
      {
        id: "lease-outside",
        unit_id: "unit-outside",
        tenant_profile_id: "tenant-lease-outside",
        collects_outside_domus: true
      },
      {
        id: "lease-domus",
        unit_id: "unit-domus",
        tenant_profile_id: "tenant-lease-domus",
        collects_outside_domus: false
      }
    ];
    getLeasesForScopeMock.mockResolvedValue({
      context: {
        propertyIds: ["property-1"],
        propertyById: new Map([["property-1", { id: "property-1", name: "Domus House" }]]),
        unitById: new Map([
          ["unit-outside", { id: "unit-outside", propertyId: "property-1", unitNumber: "1" }],
          ["unit-domus", { id: "unit-domus", propertyId: "property-1", unitNumber: "2" }]
        ])
      },
      leases,
      tenantById: new Map([
        ["tenant-lease-outside", { name: "Outside Tenant", email: "outside@example.com" }],
        ["tenant-lease-domus", { name: "Domus Tenant", email: "domus@example.com" }]
      ])
    });
    getChargeDetailsForLeasesMock.mockResolvedValue({
      chargeIds: ["charge-lease-outside", "charge-lease-domus"],
      detailsByLeaseId: new Map([
        ["lease-outside", [charge("lease-outside", 235000)]],
        ["lease-domus", [charge("lease-domus", 150000)]]
      ])
    });

    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: table === "leases" ? leases : table === "properties"
              ? [{ id: "property-1", owner_account_id: "account-1" }]
              : [{ id: "account-1", managed_client: false }],
            error: null
          }))
        }))
      }))
    });
  });

  it("excludes flagged historical late charges only from delinquency aging", async () => {
    const report = await getDelinquencyReport("owner-1");

    expect(report.map((row) => row.leaseId)).toEqual(["lease-domus"]);
    expect(report[0]?.totalOwed).toBe(150000);
  });

  it("includes an outside client-home rent in delinquency aging", async () => {
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => ({ select: vi.fn(() => ({
        in: vi.fn(async () => ({
          data: table === "leases" ? [
            { id: "lease-outside", unit_id: "unit-outside", collects_outside_domus: true },
            { id: "lease-domus", unit_id: "unit-domus", collects_outside_domus: false }
          ] : table === "properties"
            ? [{ id: "property-1", owner_account_id: "account-1" }]
            : [{ id: "account-1", managed_client: true }],
          error: null
        }))
      })) }))
    });
    const report = await getDelinquencyReport("manager-1", true);
    expect(report.map((row) => row.leaseId).sort()).toEqual(["lease-domus", "lease-outside"]);
  });

  it("keeps the same flagged balance in ordinary receivables", async () => {
    const receivables = await getReceivablesReport("owner-1");

    expect(receivables.map((row) => row.leaseId).sort()).toEqual([
      "lease-domus",
      "lease-outside"
    ]);
    expect(receivables.find((row) => row.leaseId === "lease-outside")?.totalOwedCents).toBe(
      235000
    );
  });
});
