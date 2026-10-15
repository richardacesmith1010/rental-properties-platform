import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invite: vi.fn(), lease: vi.fn(), property: vi.fn(), unit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/app/actions/tenant-invitations", () => ({ inviteTenant: mocks.invite }));
vi.mock("@/app/actions/lease-mutations", () => ({ createLease: mocks.lease }));
vi.mock("@/app/actions/properties", () => ({ createProperty: mocks.property }));
vi.mock("@/app/actions/units", () => ({ createUnit: mocks.unit }));

import { createPropertyWithSetup } from "@/app/actions/unified-setup";

const payload = { property: { name: "Maple", addressLine1: "1 Main", city: "Denver", state: "CO",
  postalCode: "80202", propertyType: "single_family" },
units: [{ id: "draft-1", label: "Unit A", bedrooms: 1, bathrooms: 1, monthlyRentDollars: 1000 }],
lease: { hasTenant: true, leasedUnitId: "draft-1", tenantFirstName: "Maya", tenantLastName: "Lopez",
  tenantEmail: "not-maya@example.com", startDate: "2026-10-31", endDate: "2027-10-31",
  dueDayOfMonth: 3, collectsOutsideDomus: true, monthlyRentDollars: 1000, depositDollars: 0 } };

describe("createPropertyWithSetup", () => {
  it("creates a home without a tenant or due day", async () => {
    mocks.property.mockResolvedValue({ success: true, propertyId: "property-1" });
    mocks.unit.mockResolvedValue({ success: true, unitId: "unit-1" });
    const form = new FormData();
    form.set("payload", JSON.stringify({ ...payload, lease: { hasTenant: false,
      dueDayOfMonth: 0, collectsOutsideDomus: false } }));
    expect((await createPropertyWithSetup(null, form))?.success).toBe(true);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("uses the tenant's entered name, due day, and collection setting", async () => {
    mocks.property.mockResolvedValue({ success: true, propertyId: "property-1" });
    mocks.unit.mockResolvedValue({ success: true, unitId: "unit-1" });
    mocks.invite.mockResolvedValue({ success: true, tenantProfileId: "tenant-1" });
    mocks.lease.mockResolvedValue({ success: true });
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    expect((await createPropertyWithSetup(null, form))?.success).toBe(true);
    const inviteForm = mocks.invite.mock.calls[0][1] as FormData;
    expect(inviteForm.get("fullName")).toBe("Maya Lopez");
    const leaseForm = mocks.lease.mock.calls[0][1] as FormData;
    expect(leaseForm.get("dueDayOfMonth")).toBe("3");
    expect(leaseForm.get("collectsOutsideDomus")).toBe("true");
  });
});
