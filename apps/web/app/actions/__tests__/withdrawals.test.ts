import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const getActiveMembersMock = vi.hoisted(() => vi.fn());
const canAdminMock = vi.hoisted(() => vi.fn());
const resolveWithdrawalMock = vi.hoisted(() => vi.fn());
const createStripeTransferMock = vi.hoisted(() => vi.fn());
const notifyAccountMembersMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/ownership-members", () => ({ getActiveMembers: getActiveMembersMock }));
vi.mock("@/lib/ownership", () => ({ canUserAdministerOwnershipAccount: canAdminMock }));
vi.mock("@/lib/withdrawals", () => ({ resolveWithdrawal: resolveWithdrawalMock }));
vi.mock("@/lib/stripe", () => ({ createStripeTransfer: createStripeTransferMock }));
vi.mock("@/lib/notifications", () => ({ notifyAccountMembers: notifyAccountMembersMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  executeApprovedWithdrawal,
  submitWithdrawalRequest,
  voteOnWithdrawal
} from "@/app/actions/withdrawals";

type Setup = {
  request?: Record<string, unknown> | null;
  requestError?: { code: string; message: string } | null;
  transferError?: Error;
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function setupAdmin(config: Setup = {}) {
  const log: string[] = [];
  const inserts: Array<{ table: string; value: unknown }> = [];
  const updates: Array<{ table: string; value: Record<string, unknown> }> = [];
  const request = config.request === undefined
    ? { id: "req-1", ownership_account_id: "account-1", requested_by: "owner-1", amount_cents: 100, status: "approved" }
    : config.request;
  const admin = {
    from: vi.fn((table: string) => ({
      insert: (value: unknown) => {
        log.push(`insert:${table}`);
        inserts.push({ table, value });
        if (table === "withdrawal_requests") {
          return { select: () => ({ single: async () => ({ data: { id: "req-1" }, error: config.requestError ?? null }) }) };
        }
        return Promise.resolve({ error: null });
      },
      update: (value: Record<string, unknown>) => {
        log.push(`update:${table}:${value.status ?? "votes"}`);
        updates.push({ table, value });
        const result = { data: value.status === "executing" ? { id: "req-1" } : null, error: null };
        return {
          eq: () => ({
            in: () => ({ select: () => ({ maybeSingle: async () => result }) }),
            then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve)
          })
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "withdrawal_requests" ? request
              : table === "ownership_accounts" ? { display_name: "LLC", stripe_account_id: "acct_llc" }
                : { payout_stripe_account_id: "acct_recipient" },
            error: table === "withdrawal_requests" ? config.requestError ?? null : null
          }),
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payout_stripe_account_id: "acct_recipient" }, error: null }) }) }),
          then: (resolve: (value: { data: { id: string }[]; error: null }) => void) =>
            Promise.resolve({ data: [{ id: "vote-1" }, { id: "vote-2" }], error: null }).then(resolve)
        })
      })
    }))
  };
  createAdminClientMock.mockReturnValue(admin);
  createStripeTransferMock.mockImplementation(async (args) => {
    log.push("stripe:transfer");
    if (config.transferError) throw config.transferError;
    return { id: "tr_1", args };
  });
  return { admin, log, inserts, updates };
}

const submitForm = () => form({ accountId: "account-1", amountDollars: "1.00", reason: "  repairs  " });
const voteForm = () => form({ requestId: "req-1", vote: "approve" });
const executeForm = () => form({ withdrawalId: "req-1" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireAuthMock.mockResolvedValue({ user: { id: "owner-1" } });
  getActiveMembersMock.mockResolvedValue({ members: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] });
  canAdminMock.mockResolvedValue(true);
  resolveWithdrawalMock.mockResolvedValue({ status: "approved" });
  notifyAccountMembersMock.mockResolvedValue(undefined);
  checkRateLimitMock.mockReturnValue({ allowed: true });
});

describe("withdrawal actions", () => {
  it.each([
    ["submit", submitWithdrawalRequest, submitForm],
    ["vote", voteOnWithdrawal, voteForm],
    ["execute", executeApprovedWithdrawal, executeForm]
  ] as const)("%s requires authentication before DB writes", async (_name, action, makeForm) => {
    const { log } = setupAdmin();
    requireAuthMock.mockRejectedValue(new Error("Not authenticated"));
    if (action === executeApprovedWithdrawal) {
      expect(await action(null, makeForm())).toEqual({ success: false, error: "Not authenticated" });
    } else {
      await expect(action(null, makeForm())).rejects.toThrow("Not authenticated");
    }
    expect(log).toEqual([]);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("submits a request with an initial vote and returns its current success state", async () => {
    const { log, inserts } = setupAdmin();
    expect(await submitWithdrawalRequest(null, submitForm())).toEqual({
      success: true, message: "Withdrawal request submitted for approval."
    });
    expect(log).toEqual(["insert:withdrawal_requests", "insert:withdrawal_votes"]);
    expect(inserts).toEqual([
      { table: "withdrawal_requests", value: {
        ownership_account_id: "account-1", requested_by: "owner-1", amount_cents: 100,
        reason: "repairs", status: "pending", votes_required: 2, votes_received: 1
      } },
      { table: "withdrawal_votes", value: { request_id: "req-1", voter_id: "owner-1", vote: "approve" } }
    ]);
  });

  it("records a vote, updates the tally, and returns approval", async () => {
    const { log, inserts, updates } = setupAdmin({ request: {
      id: "req-1", ownership_account_id: "account-1", status: "pending"
    } });
    expect(await voteOnWithdrawal(null, voteForm())).toEqual({
      success: true, message: "Vote recorded. The withdrawal is now approved."
    });
    expect(inserts).toEqual([{ table: "withdrawal_votes", value: {
      request_id: "req-1", voter_id: "owner-1", vote: "approve"
    } }]);
    expect(updates).toEqual([{ table: "withdrawal_requests", value: { votes_received: 2 } }]);
    expect(log).toEqual(["insert:withdrawal_votes", "update:withdrawal_requests:votes"]);
  });

  it("executes an approved withdrawal with ordered status and Stripe calls", async () => {
    const { log, updates } = setupAdmin();
    expect(await executeApprovedWithdrawal(null, executeForm())).toEqual({
      success: true, message: "Payout executed (tr_1)."
    });
    expect(log).toEqual([
      "update:withdrawal_requests:executing", "stripe:transfer", "update:withdrawal_requests:completed"
    ]);
    expect(createStripeTransferMock).toHaveBeenCalledWith({
      amountCents: 100, destination: "acct_recipient", transferGroup: "withdrawal:req-1",
      description: "Withdrawal payout for LLC", idempotencyKey: "withdrawal:req-1"
    });
    expect(updates[2 - 1].value).toMatchObject({ status: "completed", stripe_transfer_id: "tr_1" });
  });

  it.each(["", "0", "-5", "abc"])("refuses invalid amount %j before insert", async (amount) => {
    const { inserts } = setupAdmin();
    expect(await submitWithdrawalRequest(null, form({ accountId: "account-1", amountDollars: amount }))).toEqual({
      success: false, error: "Withdrawal amount must be greater than $0."
    });
    expect(inserts).toEqual([]);
  });

  it("currently rounds 1.005 dollars to 100 cents", async () => {
    const { inserts } = setupAdmin();
    expect(await submitWithdrawalRequest(null, form({ accountId: "account-1", amountDollars: "1.005" }))).toEqual({
      success: true, message: "Withdrawal request submitted for approval."
    });
    expect(inserts[0].value).toMatchObject({ amount_cents: 100 });
  });

  it("refuses a non-member vote before any write", async () => {
    const { inserts, updates } = setupAdmin({ request: {
      id: "req-1", ownership_account_id: "account-1", status: "pending"
    } });
    canAdminMock.mockResolvedValue(false);
    expect(await voteOnWithdrawal(null, voteForm())).toEqual({ success: false, error: "Access denied." });
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("marks a failed Stripe transfer after the executing claim", async () => {
    const { log, updates } = setupAdmin({ transferError: new Error("Stripe unavailable") });
    expect(await executeApprovedWithdrawal(null, executeForm())).toEqual({
      success: false,
      error: "Transfer failed: Stripe unavailable. The withdrawal has been marked as failed."
    });
    expect(log).toEqual([
      "update:withdrawal_requests:executing", "stripe:transfer", "update:withdrawal_requests:failed"
    ]);
    expect(updates.map(({ value }) => value.status)).toEqual(["executing", "failed"]);
  });

  it("returns the schema message on a missing request table", async () => {
    const { inserts } = setupAdmin({ requestError: { code: "42P01", message: "missing" } });
    expect(await submitWithdrawalRequest(null, submitForm())).toEqual({
      success: false, error: "Withdrawal requests require a database update before they can be used."
    });
    expect(inserts).toHaveLength(1);
  });
});
