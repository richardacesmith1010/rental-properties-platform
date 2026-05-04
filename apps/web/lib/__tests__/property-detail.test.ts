import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPropertyDetailData } from "@/lib/property-detail";

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
