import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), query: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: (table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder, order: () => builder,
      not: () => builder, is: () => builder, limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(mocks.query(table)).then(resolve, reject)
    };
    return builder;
  }
}) }));
vi.mock("@/components/bank-feed/page-shell", () => ({ BankFeedShell: () => <div>Bank loaded</div> }));
vi.mock("@/components/bank-feed/bank-balances-card", () => ({ BankBalancesCard: () => null }));
vi.mock("@/components/dashboard/owner-bottom-bar", () => ({ OwnerBottomBar: () => null }));
vi.mock("@/app/actions/bank-feed", () => ({ createBankAccount: vi.fn(), importBankRows: vi.fn(),
  answerBankItem: vi.fn(), undoBankItem: vi.fn(), deleteBankAccount: vi.fn(),
  answerQueuedBankItem: vi.fn(), keepBankChange: vi.fn() }));
vi.mock("@/app/actions/bank-connections", () => ({ startBankLink: vi.fn(), finishBankLink: vi.fn(),
  startBankRelink: vi.fn(), finishBankRelink: vi.fn(), refreshBank: vi.fn() }));
vi.mock("@/app/actions/bank-connection-management", () => ({ confirmBankLinks: vi.fn(),
  skipBankLinks: vi.fn(), disconnectBank: vi.fn() }));
vi.mock("@/app/actions/bank-balances", () => ({ setManualBalance: vi.fn() }));

import BankPage from "../page";

const rows: Record<string, unknown[]> = {
  ownership_account_members: [{ account_id: "account-1" }],
  ownership_accounts: [{ id: "account-1", display_name: "Home" }],
  properties: [{ id: "property-1", name: "Home" }]
};

describe("BankPage load failures", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
    mocks.requireRole.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.query.mockImplementation((table: string) => ({ data: rows[table] ?? [], error: null }));
  });

  it("retries a transient query result and renders the page", async () => {
    mocks.query.mockImplementationOnce(() => ({ data: null, error: { code: "PGRST301" } }));
    render(await BankPage({}));
    expect(screen.getByText("Bank loaded")).toBeInTheDocument();
    expect(mocks.query.mock.calls.filter(([table]) => table === "ownership_account_members")).toHaveLength(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("logs once after two transient failures", async () => {
    mocks.query.mockImplementation((table: string) => table === "ownership_account_members"
      ? { data: null, error: { code: "PGRST301", message: "private@example.com" } }
      : { data: rows[table] ?? [], error: null });
    render(await BankPage({}));
    expect(screen.getByText("Bank activity is not ready yet.")).toBeInTheDocument();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0][0]).toBe("[owner-bank-load-failed]");
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "ownership-members", code: "PGRST301" });
    expect(JSON.stringify(mocks.error.mock.calls[0])).not.toContain("private@example.com");
  });

  it("logs a non-transient error without retrying", async () => {
    mocks.query.mockImplementation((table: string) => table === "ownership_account_members"
      ? { data: null, error: { code: "22000" } } : { data: rows[table] ?? [], error: null });
    render(await BankPage({}));
    expect(screen.getByText("Bank activity is not ready yet.")).toBeInTheDocument();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "ownership-members", code: "22000" });
  });

  it("identifies a later failing step", async () => {
    mocks.query.mockImplementation((table: string) => table === "rent_charges"
      ? { data: null, error: { status: 503, code: "PGRST301" } }
      : { data: table === "units" ? [{ id: "unit-1", property_id: "property-1" }]
        : table === "leases" ? [{ id: "lease-1", unit_id: "unit-1" }]
          : rows[table] ?? [], error: null });
    render(await BankPage({}));
    expect(screen.getByText("Bank activity is not ready yet.")).toBeInTheDocument();
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ step: "rent-charges", status: 503 });
  });
});
