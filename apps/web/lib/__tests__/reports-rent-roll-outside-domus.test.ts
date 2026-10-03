import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: getAdministeredPropertyIdsMock
}));
vi.mock("@/lib/charge-audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/charge-audit")>();
  return {
    ...actual,
    getChargeEditHistoryMap: vi.fn().mockResolvedValue(new Map())
  };
});

import { getRentRollReport } from "@/lib/reports-rent-roll";

function queryResult<T>(data: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ["in", "is", "order", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: T; error: null }) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

function createAdmin(collectsOutsideDomus: boolean) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === "properties") {
          return queryResult([
            {
              id: "property-1",
              name: "Domus House",
              address_line1: "1 Main St",
              city: "Denver",
              state: "CO",
              postal_code: "80000"
            }
          ]);
        }
        if (table === "units") {
          return queryResult([{ id: "unit-1", property_id: "property-1", unit_number: "1" }]);
        }
        if (table === "leases") {
          return queryResult([
            {
              id: "lease-1",
              unit_id: "unit-1",
              tenant_profile_id: "tenant-1",
              start_date: "2026-01-01",
              end_date: "2026-12-31",
              monthly_rent_cents: 235000,
              lease_status: "active",
              active: true,
              collects_outside_domus: collectsOutsideDomus
            }
          ]);
        }
        if (table === "profiles") {
          return queryResult([
            { id: "tenant-1", full_name: "Resident", email: "tenant@example.com" }
          ]);
        }
        if (table === "rent_charges") {
          return queryResult([
            {
              id: "charge-1",
              lease_id: "lease-1",
              due_date: "2026-10-01",
              amount_cents: 235000,
              status: "late",
              category: "rent",
              notes: null
            }
          ]);
        }
        if (table === "payments") {
          return queryResult([]);
        }
        throw new Error(`Unexpected table ${table}`);
      })
    }))
  };
}

describe("rent roll outside-Domus accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdministeredPropertyIdsMock.mockResolvedValue(["property-1"]);
  });

  it("keeps rent-roll balances identical when the lease flag changes", async () => {
    const ordinaryAdmin = createAdmin(false);
    createAdminClientMock.mockReturnValue(ordinaryAdmin);
    const ordinary = await getRentRollReport("owner-1");
    const outsideAdmin = createAdmin(true);
    createAdminClientMock.mockReturnValue(outsideAdmin);
    const outsideDomus = await getRentRollReport("owner-1");

    expect(ordinary[0]?.currentBalance).toBe(235000);
    expect(outsideDomus[0]?.currentBalance).toBe(ordinary[0]?.currentBalance);
    expect(outsideDomus[0]?.chargeDetails[0]?.status).toBe("late");
  });
});
