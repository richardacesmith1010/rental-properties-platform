import { describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredProperties: vi.fn().mockResolvedValue([]),
  getAdministeredPropertyIdsForAccount: vi.fn().mockResolvedValue([]),
  canUserAdministerProperty: vi.fn().mockResolvedValue(false)
}));
import { getManagerPaymentEmailContext } from "@/lib/manager-payments-data";
import { getPropertyNotificationDeliveryPreferences } from "@/lib/notification-preference-store";

function query(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("null owner readers", () => {
  it("uses invoice fallback when a client home has no owner profile", async () => {
    const from = vi.fn((table: string) => {
      if (table === "manager_payments") return query({
        id: "payment", property_id: "home", manager_profile_id: "manager", config_id: null,
        category: "management_fee", description: "Management", amount_cents: 2500,
        status: "paid", payment_date: "2026-10-01", paid_at: null,
        invoice_number: "INV-1", notes: null, created_by: "manager", created_at: "2026-10-01"
      });
      if (table === "properties") return query({
        id: "home", name: "Client Home", address_line1: "1 Main St", city: "Denver",
        state: "CO", postal_code: "80202", owner_profile_id: null
      });
      if (table === "profiles") return query([{ id: "manager", full_name: "Manager", email: "manager@example.com" }]);
      return query(null);
    });
    admin.mockReturnValue({ from });
    const context = await getManagerPaymentEmailContext("payment");
    expect(context?.pdfData.fromName).toBe("Property Owner");
    expect(from.mock.calls.filter(([table]) => table === "profiles")).toHaveLength(1);
  });

  it("does not load a null owner as a notification recipient", async () => {
    vi.clearAllMocks();
    const from = vi.fn((table: string) => table === "properties"
      ? query([{ id: "home", owner_account_id: "client", owner_profile_id: null }])
      : query([]));
    const result = await getPropertyNotificationDeliveryPreferences(
      { from } as never, ["home"], "rent_due_reminder"
    );
    expect(result.get("home")).toMatchObject({ emailEnabled: true, inAppEnabled: true });
    expect(admin).not.toHaveBeenCalled();
  });
});
