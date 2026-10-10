import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildRentReminderEmailMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyPropertyTeamMock = vi.hoisted(() => vi.fn());
const getPropertyNotificationDeliveryPreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email-templates", () => ({
  buildRentReminderEmail: buildRentReminderEmailMock
}));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyPropertyTeam: notifyPropertyTeamMock
}));
vi.mock("@/lib/notification-preferences", () => ({
  getPropertyNotificationDeliveryPreferences: getPropertyNotificationDeliveryPreferencesMock
}));

import { sendDelinquencyEscalations, sendRentDueReminders } from "@/lib/delinquency";

interface ChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  category: string;
  deleted_at: string | null;
}

interface LeaseRow {
  id: string;
  tenant_profile_id: string | null;
  unit_id: string;
  collects_outside_domus: boolean | null;
}

interface UnitRow {
  id: string;
  property_id: string;
  unit_number: string;
}

interface PropertyRow {
  id: string;
  name: string;
  owner_account_id?: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface NotificationRow {
  entity_id: string | null;
  created_at: string;
}

interface DelinquencySupabaseConfig {
  charges: ChargeRow[];
  leases: LeaseRow[];
  units: UnitRow[];
  properties: PropertyRow[];
  profiles: ProfileRow[];
  notifications?: NotificationRow[];
  accounts?: Array<{ id: string; managed_client: boolean }>;
}

function createSupabaseMock(config: DelinquencySupabaseConfig): SupabaseClient {
  const client = {
    from: vi.fn((table: string) => {
      if (table === "rent_charges") {
        return {
          select: vi.fn(() => {
            const filters: {
              eq: Record<string, string>;
              in: Record<string, string[]>;
              lte: Record<string, string>;
            } = {
              eq: {},
              in: {},
              lte: {}
            };

            const builder = {
              eq: vi.fn((column: string, value: string) => {
                filters.eq[column] = value;
                return builder;
              }),
              in: vi.fn((column: string, values: string[]) => {
                filters.in[column] = values;
                return builder;
              }),
              lte: vi.fn((column: string, value: string) => {
                filters.lte[column] = value;
                return builder;
              }),
              is: vi.fn(async (column: string, value: null) => ({
                data: config.charges
                  .filter((charge) =>
                    Object.entries(filters.eq).every(([key, expected]) => charge[key as keyof ChargeRow] === expected)
                  )
                  .filter((charge) =>
                    Object.entries(filters.in).every(([key, expected]) =>
                      expected.includes(String(charge[key as keyof ChargeRow]))
                    )
                  )
                  .filter((charge) =>
                    Object.entries(filters.lte).every(([key, expected]) =>
                      String(charge[key as keyof ChargeRow]) <= expected
                    )
                  )
                  .filter((charge) =>
                    column === "deleted_at" && value === null ? charge.deleted_at === null : true
                  )
                  .map((charge) => ({
                    id: charge.id,
                    lease_id: charge.lease_id,
                    due_date: charge.due_date,
                    amount_cents: charge.amount_cents,
                    status: charge.status
                  })),
                error: null
              }))
            };

            return builder;
          })
        };
      }

      if (table === "notifications") {
        return {
          select: vi.fn(() => {
            const filters: {
              eq: Record<string, string>;
              in: Record<string, string[]>;
            } = {
              eq: {},
              in: {}
            };

            const builder = {
              eq: vi.fn((column: string, value: string) => {
                filters.eq[column] = value;
                return builder;
              }),
              in: vi.fn((column: string, values: string[]) => {
                filters.in[column] = values;
                return builder;
              }),
              gte: vi.fn(async (_column: string, value: string) => ({
                data: (config.notifications ?? []).filter((notification) => {
                  const matchesIds = filters.in.entity_id
                    ? filters.in.entity_id.includes(notification.entity_id ?? "")
                    : true;
                  return matchesIds && notification.created_at >= value;
                }),
                error: null
              }))
            };

            return builder;
          })
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.leases.filter((lease) => ids.includes(lease.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.units.filter((unit) => ids.includes(unit.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "ownership_accounts") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: (config.accounts ?? []).filter((account) => ids.includes(account.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "properties") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.properties.filter((property) => ids.includes(property.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.profiles.filter((profile) => ids.includes(profile.id)),
              error: null
            }))
          }))
        };
      }

      return {
        select: vi.fn(async () => ({ data: [], error: null }))
      };
    })
  };

  return client as unknown as SupabaseClient;
}

function buildDelinquencyConfig(overrides: Partial<DelinquencySupabaseConfig> = {}): DelinquencySupabaseConfig {
  return {
    charges: [],
    leases: [{ id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1", collects_outside_domus: false }],
    units: [{ id: "unit-1", property_id: "property-1", unit_number: "101" }],
    properties: [{ id: "property-1", name: "Domus Heights" }],
    profiles: [{ id: "tenant-1", email: "tenant@example.com", full_name: "Cassius Bell" }],
    notifications: [],
    ...overrides
  };
}

describe("delinquency notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    buildRentReminderEmailMock.mockReturnValue({
      subject: "Reminder",
      text: "Reminder text",
      html: "<p>Reminder</p>"
    });
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    notifyPropertyTeamMock.mockResolvedValue(undefined);
    getPropertyNotificationDeliveryPreferencesMock.mockResolvedValue(
      new Map([["property-1", { inAppEnabled: true, emailEnabled: true }]])
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([sendDelinquencyEscalations, sendRentDueReminders])(
    "returns before querying when notifications are off",
    async (sendNotifications) => {
      vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;

      await expect(sendNotifications(supabase)).resolves.toContain("Notifications off");
      expect(supabase.from).not.toHaveBeenCalled();
      expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    }
  );

  it("excludes soft-deleted charges from delinquency escalations while still notifying on active charges", async () => {
    const supabase = createSupabaseMock(
      buildDelinquencyConfig({
        charges: [
          {
            id: "charge-active",
            lease_id: "lease-1",
            due_date: "2026-04-03",
            amount_cents: 150000,
            status: "late",
            category: "rent",
            deleted_at: null
          },
          {
            id: "charge-deleted",
            lease_id: "lease-1",
            due_date: "2026-04-03",
            amount_cents: 150000,
            status: "late",
            category: "rent",
            deleted_at: "2026-04-15T00:00:00.000Z"
          }
        ]
      })
    );

    const result = await sendDelinquencyEscalations(supabase);

    expect(result).toBe("Overdue rent follow-ups sent: 1.");
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "charge-active" })
    );
    expect(notifyPropertyTeamMock).toHaveBeenCalledWith(expect.objectContaining({ event: "overdue_followup", entityId: "charge-active" }));
  });

  it("excludes historical late charges for leases collected outside Domus", async () => {
    const supabase = createSupabaseMock(
      buildDelinquencyConfig({
        charges: [
          {
            id: "charge-outside",
            lease_id: "lease-1",
            due_date: "2026-03-01",
            amount_cents: 150000,
            status: "late",
            category: "rent",
            deleted_at: null
          }
        ],
        leases: [
          {
            id: "lease-1",
            tenant_profile_id: "tenant-1",
            unit_id: "unit-1",
            collects_outside_domus: true
          }
        ]
      })
    );

    await expect(sendDelinquencyEscalations(supabase)).resolves.toBe(
      "Overdue rent follow-ups sent: 0."
    );
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(notifyPropertyTeamMock).not.toHaveBeenCalled();
  });

  it("excludes soft-deleted charges from rent due reminders while still notifying on active charges", async () => {
    const supabase = createSupabaseMock(
      buildDelinquencyConfig({
        charges: [
          {
            id: "charge-active",
            lease_id: "lease-1",
            due_date: "2026-05-06",
            amount_cents: 150000,
            status: "pending",
            category: "rent",
            deleted_at: null
          },
          {
            id: "charge-deleted",
            lease_id: "lease-1",
            due_date: "2026-05-06",
            amount_cents: 150000,
            status: "pending",
            category: "rent",
            deleted_at: "2026-05-02T00:00:00.000Z"
          }
        ]
      })
    );

    const result = await sendRentDueReminders(supabase);

    expect(result).toBe("Reminders sent: 1.");
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "charge-active" })
    );
  });
  it.each([
    [true, false],
    [false, true],
    [null, false]
  ] as const)("rent-due reminder eligibility for outside flag %s", async (outside, eligible) => {
    const supabase = createSupabaseMock(buildDelinquencyConfig({
      charges: [{
        id: "charge-1", lease_id: "lease-1", due_date: "2026-05-06",
        amount_cents: 150000, status: "pending", category: "rent", deleted_at: null
      }],
      leases: [{
        id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1",
        collects_outside_domus: outside
      }]
    }));
    expect(await sendRentDueReminders(supabase)).toBe(`Reminders sent: ${eligible ? 1 : 0}.`);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(eligible ? 1 : 0);
  });

  it.each([true, null] as const)(
    "outside client lease with flag %s still alerts owners but not tenant",
    async (outside) => {
      const supabase = createSupabaseMock(buildDelinquencyConfig({
        charges: [{
          id: "charge-client", lease_id: "lease-1", due_date: "2026-01-01",
          amount_cents: 150000, status: "late", category: "rent", deleted_at: null
        }],
        leases: [{
          id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1",
          collects_outside_domus: outside
        }],
        properties: [{ id: "property-1", name: "Client Home", owner_account_id: "account-1" }],
        accounts: [{ id: "account-1", managed_client: true }]
      }));
      expect(await sendDelinquencyEscalations(supabase)).toBe("Overdue rent follow-ups sent: 1.");
      expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
      expect(notifyPropertyTeamMock).toHaveBeenCalledWith(expect.objectContaining({
        event: "overdue_followup", propertyId: "property-1"
      }));
    }
  );

});
