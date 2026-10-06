import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  administeredPropertyIds: vi.fn(),
  administeredPropertyIdsForAccount: vi.fn(),
  administeredOwnerAccountIds: vi.fn(),
  role: vi.fn()
}));

function query(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const execute = () => ({ data: (state.rows[table] ?? []).filter((row) => filters.every((filter) => filter(row))), error: null });
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const result = execute();
      return { data: result.data[0] ?? null, error: result.error };
    },
    then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve)
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: query }) }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: state.administeredPropertyIds,
  getAdministeredPropertyIdsForAccount: state.administeredPropertyIdsForAccount,
  getAdministeredOwnerAccountIds: state.administeredOwnerAccountIds
}));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: state.role }));

import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getOwnerExpenseData } from "@/lib/expenses";
import { getInboxThreadsForUser } from "@/lib/inbox";
import { getTenantPaymentData } from "@/lib/tenant-payments";
import { getTenantPaymentHistory } from "@/lib/payment-history";

describe("speed loader output preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = {};
    state.administeredPropertyIds.mockResolvedValue(["property-1"]);
    state.administeredPropertyIdsForAccount.mockResolvedValue(["property-1"]);
    state.administeredOwnerAccountIds.mockResolvedValue(["account-1"]);
    state.role.mockResolvedValue("owner");
  });

  it("keeps ownership account fields and member counts", async () => {
    state.rows.ownership_account_members = [
      { account_id: "account-1", profile_id: "owner-1", active: true },
      { account_id: "account-1", profile_id: "owner-2", active: true }
    ];
    state.rows.ownership_accounts = [{
      id: "account-1", account_type: "llc", display_name: "Forum LLC", join_code: "FORUM",
      stripe_account_id: "acct_1", stripe_onboarding_complete: true, stripe_status: "active",
      distribution_mode: "retain", plaid_account_id: null, plaid_bank_name: null, plaid_bank_mask: null,
      plaid_balance_cents: null, plaid_balance_updated_at: null, created_by_profile_id: "owner-1"
    }];

    expect(await getOwnershipAccountsForUser("owner-1")).toEqual([{
      id: "account-1", accountType: "llc", displayName: "Forum LLC", memberCount: 2,
      joinCode: "FORUM", stripeConnected: true, distributionMode: "retain", stripeAccountId: "acct_1",
      stripeStatus: "active", plaidConnected: false, bankName: null, bankMask: null,
      balanceCents: null, balanceUpdatedAt: null
    }]);
  });

  it("keeps expense, vendor, and paid-rent totals", async () => {
    state.rows.properties = [{ id: "property-1", name: "Forum House" }];
    state.rows.property_expenses = [{
      id: "expense-1", property_id: "property-1", category: "repair", description: "Sink",
      amount_cents: 2500, expense_date: "2026-10-01", recurring: false, recurring_frequency: null,
      vendor_id: "vendor-1", receipt_file_id: null, created_at: "2026-10-01T00:00:00Z"
    }];
    state.rows.vendors = [{ id: "vendor-1", name: "Plumber" }];
    state.rows.units = [{ id: "unit-1", property_id: "property-1" }];
    state.rows.leases = [{ id: "lease-1", unit_id: "unit-1" }];
    state.rows.rent_charges = [{ lease_id: "lease-1", amount_cents: 10000, due_date: "2026-10-01", status: "paid", deleted_at: null }];

    const data = await getOwnerExpenseData("owner-1", "account-1");

    expect(data.properties).toEqual([{ id: "property-1", name: "Forum House" }]);
    expect(data.expenses).toEqual([expect.objectContaining({
      id: "expense-1", propertyName: "Forum House", amountCents: 2500, vendorName: "Plumber"
    })]);
    expect(data.pnlByProperty).toEqual([{
      propertyId: "property-1", propertyName: "Forum House", incomeCents: 10000,
      expenseCents: 2500, netCents: 7500
    }]);
  });

  it("keeps inbox thread messages and sender names with a known role", async () => {
    state.rows.inbox_threads = [{
      id: "thread-1", property_id: "property-1", entity_type: "tenant_profile", entity_id: "tenant-1",
      subject: "Sink", created_by_profile_id: "owner-1", created_at: "2026-10-01", updated_at: "2026-10-02"
    }];
    state.rows.inbox_messages = [{
      id: "message-1", thread_id: "thread-1", sender_profile_id: "owner-1", sender_email: null,
      body: "Scheduled", channel: "in_app", direction: "outbound", created_at: "2026-10-02"
    }];
    state.rows.properties = [{ id: "property-1", name: "Forum House" }];
    state.rows.profiles = [{ id: "owner-1", full_name: "Courtney", email: "owner@example.test" }];

    const baseline = await getInboxThreadsForUser("owner-1");
    state.role.mockClear();
    const threads = await getInboxThreadsForUser("owner-1", "owner");

    expect(threads).toEqual(baseline);
    expect(threads).toEqual([expect.objectContaining({
      id: "thread-1", propertyName: "Forum House", latestMessagePreview: "Scheduled", messageCount: 1,
      messages: [expect.objectContaining({ id: "message-1", senderName: "Courtney" })]
    })]);
    expect(state.role).not.toHaveBeenCalled();
  });

  it("keeps tenant charge labels and outside-collection status", async () => {
    state.rows.leases = [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1", active: true,
      collects_outside_domus: true }];
    state.rows.units = [{ id: "unit-1", unit_number: "2B", property_id: "property-1" }];
    state.rows.properties = [{ id: "property-1", name: "Forum House" }];
    state.rows.rent_charges = [{ id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01",
      amount_cents: 10000, status: "late", deleted_at: null }];

    expect(await getTenantPaymentData("tenant-1")).toEqual({ charges: [expect.objectContaining({
      id: "charge-1", propertyId: "property-1", propertyName: "Forum House", unitNumber: "2B",
      amountCents: 10000, status: "pending", collectsOutsideDomus: true
    })] });
  });

  it("keeps tenant payment history after concurrent unit and charge reads", async () => {
    state.rows.leases = [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1" }];
    state.rows.units = [{ id: "unit-1", unit_number: "2B", property_id: "property-1" }];
    state.rows.properties = [{ id: "property-1", name: "Forum House" }];
    state.rows.rent_charges = [{
      id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01", amount_cents: 10000,
      category: "rent", deleted_at: null
    }];
    state.rows.payments = [{
      id: "payment-1", rent_charge_id: "charge-1", paid_at: "2026-10-02T00:00:00Z",
      amount_cents: 10000, method: "card", reference_note: "October"
    }];

    expect(await getTenantPaymentHistory("tenant-1")).toEqual([{
      chargeId: "charge-1", paymentId: "payment-1", paidAt: "2026-10-02T00:00:00Z",
      amountCents: 10000, method: "card", category: "rent", dueDate: "2026-10-01",
      propertyName: "Forum House", unitNumber: "2B", referenceNote: "October"
    }]);
  });
});
