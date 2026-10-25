import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

export function createLateFeeSupabaseMock(params: {
  collectsOutsideDomus: boolean | null;
  clientHome?: boolean;
  accountError?: boolean;
  existingLateFee?: boolean;
  tenantPrefs?: Record<string, boolean>;
  dueDate?: string;
  lateFeeCents?: number;
  additionalCandidates?: Array<{ dueDate?: string; lateFeeCents?: number }>;
}) {
  const update = vi.fn(() => {
    const builder = {
      in: vi.fn(() => builder),
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve)
    };
    return builder;
  });
  const insert = vi.fn(async () => ({ error: null }));
  const candidate = {
    id: "charge-1",
    lease_id: "lease-1",
    due_date: params.dueDate ?? "2026-09-01",
    status: "pending",
    category: "rent"
  };

  const candidateOptions = [params, ...(params.additionalCandidates ?? [])];
  const candidates = candidateOptions.map((option, index) => ({
    ...candidate,
    id: `charge-${index + 1}`,
    lease_id: `lease-${index + 1}`,
    due_date: option.dueDate ?? candidate.due_date
  }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === "rent_charges") {
        return {
          select: vi.fn((columns: string) => {
            if (columns.includes("parent_charge_id")) {
              const builder = {
                in: vi.fn(() => builder),
                eq: vi.fn(() => builder),
                is: vi.fn(async () => ({
                  data: params.existingLateFee
                    ? [{ id: "late-fee-1", parent_charge_id: "charge-1" }]
                    : [],
                  error: null
                }))
              };
              return builder;
            }

            const builder = {
              in: vi.fn(() => builder),
              eq: vi.fn(() => builder),
              lt: vi.fn(() => builder),
              is: vi.fn(async () => ({ data: candidates, error: null }))
            };
            return builder;
          }),
          update,
          insert
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: candidateOptions.map((option, index) => (
                {
                  id: `lease-${index + 1}`,
                  tenant_profile_id: "tenant-1",
                  unit_id: "unit-1",
                  grace_period_days: 5,
                  late_fee_cents: option.lateFeeCents ?? 5000,
                  lease_status: "active",
                  collects_outside_domus: params.collectsOutsideDomus
                }
              )),
              error: null
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ id: "unit-1", property_id: "property-1" }],
              error: null
            }))
          }))
        };
      }

      if (table === "properties") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({
          data: [{ id: "property-1", owner_account_id: "account-1" }], error: null
        })) })) };
      }

      if (table === "ownership_accounts") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({
          data: [{ id: "account-1", managed_client: params.clientHome === true }],
          error: params.accountError ? new Error("account lookup failed") : null
        })) })) };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ id: "tenant-1", email: "tenant@example.com",
                notification_preferences: params.tenantPrefs ?? {} }],
              error: null
            }))
          }))
        };
      }

      throw new Error(`Unexpected table ${table}`);
    })
  };

  return {
    supabase: client as unknown as SupabaseClient,
    from: client.from,
    update,
    insert
  };
}

export function setToday(isoDateTime: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDateTime));
}
