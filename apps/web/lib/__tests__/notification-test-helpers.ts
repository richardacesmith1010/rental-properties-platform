import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

export interface NotificationAdminConfig {
  notificationId?: string;
  existingDeliveries?: Array<{ channel: string; status: string }>;
  property?: { owner_account_id: string | null } | null;
  members?: Array<{ profile_id: string; can_receive_critical_alerts: boolean }>;
  profiles?: Array<{ id: string; email: string | null }>;
  throwsOnPropertyLookup?: boolean;
  managedClient?: boolean;
  assignments?: Array<string | { manager_profile_id: string; property_id?: string; active: boolean }>;
  accountLinks?: Array<string | { manager_profile_id: string; account_id?: string; active: boolean }>;
  profileLookupError?: boolean;
  profileLookupErrorIds?: string[];
  membersByAccount?: Record<string, Array<{ profile_id: string; can_receive_critical_alerts: boolean }>>;
  accountLinksByAccount?: Record<string, Array<string | { manager_profile_id: string; active: boolean }>>;
  failingRecipients?: string[];
}

export function createNotificationAdminClient(config: NotificationAdminConfig): SupabaseClient {
  const rowsWithFilters = <T extends Record<string, unknown>>(rows: T[]) => {
    let filtered = rows;
    const builder = {
      eq: vi.fn((column: string, value: unknown) => {
        filtered = filtered.filter((row) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filtered = filtered.filter((row) => values.includes(row[column]));
        return Promise.resolve({ data: filtered, error: null });
      }),
      then: (resolve: (value: { data: T[]; error: null }) => unknown) =>
        Promise.resolve({ data: filtered, error: null }).then(resolve)
    };
    return builder;
  };
  const deliveryInsertMock = vi.fn().mockResolvedValue({ error: null });
  const notificationsUpsertMock = vi.fn((row: { recipient_profile_id: string }) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue((config.failingRecipients ?? []).includes(row.recipient_profile_id)
        ? { data: null, error: { code: "XX001" } }
        : { data: { id: `${config.notificationId ?? "notification"}-${row.recipient_profile_id}` }, error: null })
    }))
  }));

  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      return {
        upsert: notificationsUpsertMock
      };
    }

    if (table === "notification_deliveries") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: config.existingDeliveries ?? [], error: null })
        })),
        insert: deliveryInsertMock
      };
    }

    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: config.throwsOnPropertyLookup
              ? vi.fn().mockRejectedValue(new Error("property lookup failed"))
              : vi.fn().mockResolvedValue({ data: config.property ?? { owner_account_id: "account-1" }, error: null }),
            single: config.throwsOnPropertyLookup
              ? vi.fn().mockRejectedValue(new Error("property lookup failed"))
              : vi.fn().mockResolvedValue({ data: config.property ?? { owner_account_id: "account-1" }, error: null })
          }))
        }))
      };
    }

    if (table === "ownership_accounts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { managed_client: config.managedClient ?? false }, error: null
            })
          }))
        }))
      };
    }
    if (table === "property_managers") {
      return {
        select: vi.fn(() => rowsWithFilters((config.assignments ?? []).map((assignment) =>
          typeof assignment === "string"
            ? { manager_profile_id: assignment, property_id: "property-1", active: true }
            : { property_id: "property-1", ...assignment }
        )))
      };
    }
    if (table === "ownership_account_managers") {
      return { select: vi.fn(() => {
        const links = config.accountLinksByAccount
          ? Object.entries(config.accountLinksByAccount).flatMap(([account_id, rows]) =>
            rows.map((row) => typeof row === "string"
              ? { manager_profile_id: row, account_id, active: true }
              : { account_id, ...row }))
          : (config.accountLinks ?? []).map((row) => typeof row === "string"
            ? { manager_profile_id: row, account_id: "account-1", active: true }
            : { account_id: "account-1", ...row });
        return rowsWithFilters(links);
      }) };
    }
    if (table === "ownership_account_members") {
      return { select: vi.fn(() => rowsWithFilters(config.membersByAccount
        ? Object.entries(config.membersByAccount).flatMap(([account_id, members]) =>
          members.map((member) => ({ ...member, account_id, member_role: "owner", active: true })))
        : (config.members ?? []).map((member) => ({
          ...member, account_id: "account-1", member_role: "owner", active: true
        })))) };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          in: vi.fn((_column: string, ids: string[]) => Promise.resolve({
            data: (config.profiles ?? []).filter((profile) => ids.includes(profile.id)), error: null
          })),
          eq: vi.fn((column: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: (config.profiles ?? []).find((profile) => profile.id === value) ?? null,
              error: config.profileLookupError || config.profileLookupErrorIds?.includes(value)
                ? { code: "XX001" } : null
            })
          }))
        }))
      };
    }

    return {
      select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    };
  });

  return { from } as unknown as SupabaseClient;
}

export function notificationUpserts(admin: SupabaseClient) {
  const upserts = new Set<ReturnType<typeof vi.fn>>();
  vi.mocked(admin.from).mock.results.forEach((result, index) => {
    if (vi.mocked(admin.from).mock.calls[index]?.[0] === "notifications" && result.value?.upsert) {
      upserts.add(result.value.upsert);
    }
  });
  return Array.from(upserts).flatMap((upsert) => upsert.mock.calls);
}

export function notificationDeliveryInserts(admin: SupabaseClient) {
  const inserts = new Set<ReturnType<typeof vi.fn>>();
  vi.mocked(admin.from).mock.results.forEach((result, index) => {
    if (vi.mocked(admin.from).mock.calls[index]?.[0] === "notification_deliveries" && result.value?.insert) {
      inserts.add(result.value.insert);
    }
  });
  return Array.from(inserts).flatMap((insert) => insert.mock.calls);
}
