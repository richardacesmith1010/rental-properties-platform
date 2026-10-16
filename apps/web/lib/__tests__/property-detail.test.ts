import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPropertyDetailData } from "@/lib/property-detail";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PropertyDetailView } from "@/components/dashboard/property-detail-view";

const createAdminClientMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const getPortfolioDataMock = vi.hoisted(() => vi.fn());
const getAdminMaintenanceTicketsMock = vi.hoisted(() => vi.fn());
const getPropertyChargeDataMock = vi.hoisted(() => vi.fn());
const getPropertyDocumentDataMock = vi.hoisted(() => vi.fn());
const getPropertyActivityDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));
vi.mock("@/lib/property-access", () => ({
  canUserAdministerProperty: canUserAdministerPropertyMock
}));
vi.mock("@/lib/portfolio", () => ({
  getPortfolioData: getPortfolioDataMock
}));
vi.mock("@/lib/maintenance", () => ({
  getAdminMaintenanceTickets: getAdminMaintenanceTicketsMock
}));
vi.mock("@/lib/property-detail-queries", () => ({
  getPropertyChargeData: getPropertyChargeDataMock,
  getPropertyDocumentData: getPropertyDocumentDataMock,
  getPropertyActivityData: getPropertyActivityDataMock
}));

describe("getPropertyDetailData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockReturnValue({ marker: "admin" });
  });

  it("returns null when the user cannot administer the property", async () => {
    canUserAdministerPropertyMock.mockResolvedValue(false);

    const result = await getPropertyDetailData("property-1", "user-1");

    expect(result).toBeNull();
    expect(getPortfolioDataMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("assembles property-scoped detail data from the existing loaders", async () => {
    canUserAdministerPropertyMock.mockResolvedValue(true);
    getPortfolioDataMock.mockResolvedValue({
      properties: [
        {
          id: "property-1",
          name: "Atlas House",
          addressLine1: "123 Forum Ave",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          managementFeeCents: 0,
          unitCount: 2,
          ownerAccountId: "account-1",
          ownerAccountName: "Atlas LLC",
          active: true
        },
        {
          id: "property-2",
          name: "Imperium Flats",
          addressLine1: "456 Solar Way",
          city: "Aurora",
          state: "CO",
          postalCode: "80012",
          managementFeeCents: 0,
          unitCount: 1,
          ownerAccountId: "account-2",
          ownerAccountName: "Imperium Holdings",
          active: true
        }
      ],
      units: [
        {
          id: "unit-2",
          propertyId: "property-1",
          propertyName: "Atlas House",
          unitNumber: "B",
          bedrooms: 1,
          bathrooms: 1,
          monthlyRentCents: 120000,
          squareFeet: null,
          occupied: false,
          active: true
        },
        {
          id: "unit-1",
          propertyId: "property-1",
          propertyName: "Atlas House",
          unitNumber: "A",
          bedrooms: 2,
          bathrooms: 1,
          monthlyRentCents: 150000,
          squareFeet: null,
          occupied: true,
          active: true
        },
        {
          id: "unit-3",
          propertyId: "property-2",
          propertyName: "Imperium Flats",
          unitNumber: "1",
          bedrooms: 2,
          bathrooms: 2,
          monthlyRentCents: 180000,
          squareFeet: null,
          occupied: true,
          active: true
        }
      ],
      leases: [
        {
          id: "lease-older",
          unitId: "unit-1",
          propertyId: "property-1",
          propertyName: "Atlas House",
          tenantProfileId: "tenant-1",
          unitLabel: "Atlas House • A",
          tenantName: "Ava Tenant",
          tenantEmail: "ava@example.com",
          tenantPhone: "555-0001",
          monthlyRentCents: 150000,
          depositCents: 150000,
          dueDayOfMonth: 1,
          startDate: "2025-01-01",
          endDate: "2025-12-31",
          leaseStatus: "active",
          gracePeriodDays: 5,
          lateFeeCents: 0,
          notes: null,
          active: true
        },
        {
          id: "lease-newer",
          unitId: "unit-2",
          propertyId: "property-1",
          propertyName: "Atlas House",
          tenantProfileId: "tenant-2",
          unitLabel: "Atlas House • B",
          tenantName: "Ben Tenant",
          tenantEmail: "ben@example.com",
          tenantPhone: null,
          monthlyRentCents: 120000,
          depositCents: 120000,
          dueDayOfMonth: 1,
          startDate: "2025-06-01",
          endDate: "2026-05-31",
          leaseStatus: "active",
          gracePeriodDays: 5,
          lateFeeCents: 0,
          notes: null,
          active: true
        },
        {
          id: "lease-other",
          unitId: "unit-3",
          propertyId: "property-2",
          propertyName: "Imperium Flats",
          tenantProfileId: "tenant-3",
          unitLabel: "Imperium Flats • 1",
          tenantName: "Cara Tenant",
          tenantEmail: "cara@example.com",
          tenantPhone: null,
          monthlyRentCents: 180000,
          depositCents: 180000,
          dueDayOfMonth: 1,
          startDate: "2025-02-01",
          endDate: "2026-01-31",
          leaseStatus: "active",
          gracePeriodDays: 5,
          lateFeeCents: 0,
          notes: null,
          active: true
        }
      ],
      tenants: [
        {
          id: "tenant-1",
          email: "ava@example.com",
          fullName: "Ava Tenant",
          phone: "555-0001",
          propertyIds: ["property-1"]
        },
        {
          id: "tenant-2",
          email: "ben@example.com",
          fullName: "Ben Tenant",
          phone: null,
          propertyIds: ["property-1"]
        },
        {
          id: "tenant-3",
          email: "cara@example.com",
          fullName: "Cara Tenant",
          phone: null,
          propertyIds: ["property-2"]
        }
      ]
    });
    getAdminMaintenanceTicketsMock.mockResolvedValue([
      {
        id: "ticket-2",
        propertyId: "property-1",
        propertyName: "Atlas House",
        unitNumber: "B",
        title: "Leak",
        description: "Kitchen leak",
        status: "open",
        priority: "high",
        actualCostCents: null,
        vendorName: null,
        assignmentStatus: null,
        photoCount: 0,
        latestPhotoId: null,
        photos: [],
        createdAt: "2025-06-15T12:00:00.000Z",
        resolvedAt: null,
        tenantEmail: null,
        commentCount: 0,
        comments: [],
        timeline: []
      },
      {
        id: "ticket-1",
        propertyId: "property-1",
        propertyName: "Atlas House",
        unitNumber: "A",
        title: "Door",
        description: "Front door",
        status: "closed",
        priority: "low",
        actualCostCents: null,
        vendorName: null,
        assignmentStatus: null,
        photoCount: 0,
        latestPhotoId: null,
        photos: [],
        createdAt: "2025-05-01T12:00:00.000Z",
        resolvedAt: null,
        tenantEmail: null,
        commentCount: 0,
        comments: [],
        timeline: []
      },
      {
        id: "ticket-other",
        propertyId: "property-2",
        propertyName: "Imperium Flats",
        unitNumber: "1",
        title: "HVAC",
        description: "Issue",
        status: "open",
        priority: "urgent",
        actualCostCents: null,
        vendorName: null,
        assignmentStatus: null,
        photoCount: 0,
        latestPhotoId: null,
        photos: [],
        createdAt: "2025-07-01T12:00:00.000Z",
        resolvedAt: null,
        tenantEmail: null,
        commentCount: 0,
        comments: [],
        timeline: []
      }
    ]);
    getPropertyChargeDataMock.mockResolvedValue({
      charges: [{ id: "charge-1", propertyId: "property-1" }],
      payments: [{ id: "payment-1", propertyId: "property-1" }]
    });
    getPropertyDocumentDataMock.mockResolvedValue({
      files: [{ id: "file-1", propertyId: "property-1" }],
      propertyFilesEnabled: true,
      propertyFilesWarning: null
    });
    getPropertyActivityDataMock.mockResolvedValue([
      { id: "activity-1", propertyId: "property-1" }
    ]);

    const result = await getPropertyDetailData("property-1", "user-1");

    expect(createAdminClientMock).toHaveBeenCalledOnce();
    expect(getPropertyChargeDataMock).toHaveBeenCalledWith(
      { marker: "admin" },
      "property-1"
    );
    expect(result?.property.id).toBe("property-1");
    expect(result?.units.map((unit) => unit.id)).toEqual(["unit-1", "unit-2"]);
    expect(result?.leases.map((lease) => lease.id)).toEqual([
      "lease-newer",
      "lease-older"
    ]);
    expect(result?.tenants.map((tenant) => tenant.id)).toEqual([
      "tenant-1",
      "tenant-2"
    ]);
    expect(result?.maintenance.map((ticket) => ticket.id)).toEqual([
      "ticket-2",
      "ticket-1"
    ]);
    expect(result?.charges).toEqual([{ id: "charge-1", propertyId: "property-1" }]);
    expect(result?.payments).toEqual([{ id: "payment-1", propertyId: "property-1" }]);
    expect(result?.documents.files).toEqual([
      { id: "file-1", propertyId: "property-1" }
    ]);
    expect(result?.activity).toEqual([
      { id: "activity-1", propertyId: "property-1" }
    ]);
  });
});

describe("property payment query", () => {
  it("gets payment dates from active rows while retaining reversed history", async () => {
    const actual = await vi.importActual<typeof import("@/lib/property-detail-queries")>("@/lib/property-detail-queries");
    const calls: string[] = [];
    const rows: Record<string, Array<Record<string, unknown>>> = {
      units: [{ id: "unit-1", unit_number: "1", property_id: "property-1" }],
      leases: [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1" }],
      profiles: [{ id: "tenant-1", full_name: "Tenant", email: null }],
      rent_charges: [{ id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01",
        amount_cents: 10000, status: "paid", category: "rent" }],
      payments: [
        { id: "reversed", rent_charge_id: "charge-1", paid_at: "2026-10-05", amount_cents: 10000,
          method: "ach", reversed_at: "2026-10-06" },
        { id: "active", rent_charge_id: "charge-1", paid_at: "2026-10-03", amount_cents: 10000,
          method: "ach", reversed_at: null }
      ]
    };
    const admin = { from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const result = () => ({ data: (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))), error: null });
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
        is: (key: string, value: unknown) => { if (table === "payments") calls.push(`is:${key}`);
          filters.push((row) => (row[key] ?? null) === value); return query; },
        order: () => query,
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
      };
      return query;
    } };
    const result = await actual.getPropertyChargeData(admin as never, "property-1");
    expect(result.charges[0].paymentDate).toBe("2026-10-03");
    expect(result.payments.map((payment) => payment.id)).toEqual(["reversed", "active"]);
    expect((result.payments[0] as typeof result.payments[0] & { reversedAt: string }).reversedAt).toBe("2026-10-06");
    expect(calls).toEqual(["is:reversed_at"]);
  });

  it("labels reversed payment history on the property Payments tab", () => {
    const data = {
      property: { id: "property-1", name: "Forum House", addressLine1: "1 Main St",
        city: "Denver", state: "CO", postalCode: "80000", ownerAccountName: "Owner" },
      units: [], leases: [], tenants: [], charges: [], maintenance: [], activity: [],
      documents: { files: [], propertyFilesEnabled: false, propertyFilesWarning: null },
      payments: [{ id: "payment-1", chargeId: "charge-1", propertyId: "property-1",
        tenantProfileId: "tenant-1", tenantName: "Tenant", unitNumber: "1", amountCents: 120000,
        paidAt: "2026-10-03", method: "ach", reversedAt: "2026-10-04" }]
    };
    render(createElement(PropertyDetailView, { data, role: "owner",
      onCreateTenantActivity: vi.fn(), onGetTenantActivityLog: vi.fn(), onSendMessageToTenant: vi.fn(),
      onAddTicketComment: vi.fn(), onUpdateTicketStatus: vi.fn() } as never));
    fireEvent.click(screen.getByRole("button", { name: /payments/i }));
    expect(screen.getByText("Reversed")).toBeTruthy();
    expect(screen.getByText(/\$1,200/)).toBeTruthy();
  });
});
