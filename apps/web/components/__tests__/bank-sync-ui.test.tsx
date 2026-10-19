import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { BankFeedShell } from "@/components/bank-feed/page-shell";
import { loadLinkSession } from "@/components/bank-feed/link-session";
import { BankConnectionsCard } from "@/components/bank-feed/bank-connections-card";
import { QueuedReviewList } from "@/components/bank-feed/queued-review-list";
import { NeedsYouList } from "@/components/dashboard/owner-home/needs-you-list";
import { OwnershipAccountCard } from "@/components/dashboard/ownership/account-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/bank-feed/plaid-script", () => ({ loadPlaidScript: vi.fn(async () => {}) }));

const actions = { start: vi.fn(async () => ({ success: true, linkToken: "link" })),
  finish: vi.fn(async () => ({ success: true, connectionId: "connection" })),
  startRelink: vi.fn(), finishRelink: vi.fn(), refresh: vi.fn(async () => ({ success: true })),
  disconnect: vi.fn(async () => ({ success: true })), confirm: vi.fn(), skip: vi.fn() };

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); delete window.Plaid; });

describe("Sprint 224 bank UI", () => {
  it("Connect a bank opens Plaid Link and sends only selected IDs and the public token", async () => {
    const open = vi.fn();
    window.Plaid = { create: vi.fn((config) => {
      open.mockImplementation(() => config.onSuccess("public-token", { accounts: [
        { id: "first", name: "Forged name" }, { id: "second", mask: "9999" }
      ] }));
      return { open };
    }) };
    render(<BankConnectionsCard ownerAccountId="owner" connections={[]} actions={actions} />);
    expect(screen.getByRole("button", { name: "Connect a bank" }))
      .toHaveClass("bg-[var(--action)]", "text-[var(--action-contrast)]");
    fireEvent.click(screen.getByRole("button", { name: "Connect a bank" }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    await waitFor(() => expect(actions.finish).toHaveBeenCalledWith({ ownerAccountId: "owner",
      publicToken: "public-token", selectedAccountIds: ["first", "second"] }));
  });

  it("shows exact connection health copy and abandoned matching", () => {
    render(<BankConnectionsCard ownerAccountId="owner" actions={actions} connections={[
      { id: "one", institution_name: "Fidelity", status: "ok", last_synced_at: new Date().toISOString(), accounts: [] },
      { id: "two", institution_name: "Navy Federal", status: "needs_login", last_synced_at: null, accounts: [] },
      { id: "three", institution_name: "Other", status: "error", last_synced_at: null, accounts: [] },
      { id: "four", institution_name: "Bank", status: "pending_account_match", last_synced_at: null, accounts: [] }
    ]} />);
    expect(screen.getByText(/Up to date ·/)).toBeInTheDocument();
    expect(screen.getAllByText("Sign in again")).toHaveLength(2);
    expect(screen.getAllByText("Something went wrong. Try again.")).toHaveLength(2);
    expect(screen.getAllByText("Finish connecting")).toHaveLength(2);
  });

  it("renders persisted queue and changed items and Home count", () => {
    render(<><QueuedReviewList items={[{ id: "queued", bank_account_id: "bank", updated_at: "2026-10-12T00:00:00Z",
      posted_on: "2026-10-02", amount_cents: 235000, direction: "in", description: "Angel rent",
      suggestion: null, possible_duplicate: true }]} changed={[{ id: "changed", description: "Solar bill",
      bank_change: "modified" }]} properties={[]} charges={[]} actions={{ answer: vi.fn(), keep: vi.fn(), undo: vi.fn() }} />
      <NeedsYouList summary={{ lateCharges: [], openRepairCount: 0, newMessageCount: 0 }}
        bankState={{ status: "connected", href: "/owner/bank", accountName: null } as never}
        bankNeedsCount={2} onOpenSection={vi.fn()} /></>);
    expect(screen.getByText("Angel rent")).toBeInTheDocument();
    expect(screen.getByText("Maybe already added from a statement file.")).toBeInTheDocument();
    expect(screen.getByText("The bank changed this after it was filed.")).toBeInTheDocument();
    expect(screen.getByText("2 bank items to check")).toBeInTheDocument();
  });

  it("offers Finish connecting for abandoned matching without an old connect prompt", () => {
    render(<NeedsYouList summary={{ lateCharges: [], openRepairCount: 0, newMessageCount: 0 }}
      bankState={{ status: "disconnected", href: "/owner/setup", accountName: null } as never}
      hasBankConnection hasPendingBankConnection onOpenSection={vi.fn()} />);
    expect(screen.getByText("Finish connecting")).toBeInTheDocument();
    expect(screen.queryByText(/Connect your bank/)).not.toBeInTheDocument();
  });
  it("6b No it's new sends no pair and mismatched institutions are not offered", async () => {
    actions.confirm.mockResolvedValueOnce({ success: true });
    render(<BankConnectionsCard ownerAccountId="owner" connections={[]} actions={actions} pendingMatch={{
      connectionId: "connection", plaidAccounts: [{ id: "plaid", nickname: "Checking", institution: "fidelity" }],
      uploadAccounts: [{ id: "same", nickname: "Old Fidelity", institution: "fidelity" },
        { id: "other", nickname: "Other bank", institution: "navy_federal" }]
    }} />);
    expect(screen.getByRole("option", { name: "Old Fidelity · fidelity" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Other bank · navy_federal" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish connecting" }));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalledWith({ connectionId: "connection", pairs: [] }));
  });
  it("9 Ownership account card renders no Plaid link button", () => {
    render(<OwnershipAccountCard account={{ id: "owner", accountType: "personal", displayName: "Owner",
      memberCount: 1, distributionMode: "equal" } as never} isLast isActive={false} isRenaming={false}
      isDistributionOpen={false} isWithdrawalOpen={false} onCancelRename={vi.fn()}
      onToggleDistribution={vi.fn()} onInitiatePlaidLink={vi.fn()} onCompletePlaidLink={vi.fn()}
      onRefreshPlaidBalance={vi.fn()} onDisconnectPlaid={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Plaid|link bank|connect bank/i })).not.toBeInTheDocument();
  });
  it("7b flagged Undo invokes the supplied undoBankItem action", async () => {
    const undoBankItem = vi.fn(async () => ({ success: true }));
    render(<QueuedReviewList items={[]} changed={[{ id: "changed", description: "Solar bill",
      bank_change: "modified" }]} properties={[]} charges={[]}
      actions={{ answer: vi.fn(), keep: vi.fn(), undo: undoBankItem }} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(undoBankItem).toHaveBeenCalledWith({ bankTransactionId: "changed" }));
  });
});


describe("§8.5 bank connection OAuth sessions", () => {
  type Config = Parameters<NonNullable<Window["Plaid"]>["create"]>[0];
  let config: Config;
  function setup() {
    const open = vi.fn(() => expect(loadLinkSession(Date.now())).toMatchObject({ linkToken: "link", mode: "create" }));
    window.Plaid = { create: vi.fn((value) => { config = value; return { open }; }) };
    render(<BankConnectionsCard ownerAccountId="owner" connections={[]} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect a bank" }));
    return open;
  }
  it("saves before open and clears after success", async () => {
    const open = setup(); await waitFor(() => expect(open).toHaveBeenCalled());
    await act(async () => config.onSuccess("synthetic-public", {}));
    expect(localStorage.getItem("domus.plaidLink")).toBeNull();
  });
  it("clears on exit", async () => {
    const open = setup(); await waitFor(() => expect(open).toHaveBeenCalled());
    act(() => config.onExit?.(null));
    expect(localStorage.getItem("domus.plaidLink")).toBeNull();
  });
  it.each(["returned", "thrown"])("clears on %s finish failure", async (kind) => {
    if (kind === "thrown") actions.finish.mockRejectedValueOnce(new Error("failed"));
    else actions.finish.mockResolvedValueOnce({ success: false, connectionId: "" });
    const open = setup(); await waitFor(() => expect(open).toHaveBeenCalled());
    await act(async () => config.onSuccess("synthetic-public", {}));
    expect(localStorage.getItem("domus.plaidLink")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
  });
  it("storage failure prevents opening Link and shows Try again", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    const open = setup();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again."));
    expect(open).not.toHaveBeenCalled(); expect(window.Plaid?.create).not.toHaveBeenCalled();
  });
  it("relink saves the connection and uses finishRelink", async () => {
    actions.startRelink.mockResolvedValueOnce({ success: true, linkToken: "synthetic-relink" });
    actions.finishRelink.mockResolvedValueOnce({ success: true });
    const open = vi.fn(() => expect(loadLinkSession(Date.now())).toMatchObject({ mode: "relink", connectionId: "c" }));
    window.Plaid = { create: vi.fn((value) => { config = value; return { open }; }) };
    render(<BankConnectionsCard ownerAccountId="owner" actions={actions} connections={[
      { id: "c", institution_name: "Bank", status: "needs_login", last_synced_at: null, accounts: [] }
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    await act(async () => config.onSuccess("unused", {}));
    expect(actions.finishRelink).toHaveBeenCalledWith({ connectionId: "c" });
    expect(localStorage.getItem("domus.plaidLink")).toBeNull();
  });
  it.each([true, false])("nativeApp=%s produces correct first-render HTML through BankFeedShell", (nativeApp) => {
    const html = renderToString(<BankFeedShell nativeApp={nativeApp} ownerAccountId="owner"
      accounts={[]} bankAccounts={[]} properties={[]} charges={[]} recent={[]} connectionActions={actions}
      actions={{ createBankAccount: vi.fn(), importBankRows: vi.fn(), answerBankItem: vi.fn(),
        undoBankItem: vi.fn(), deleteBankAccount: vi.fn() }} connections={[
        { id: "login", institution_name: "Bank", status: "needs_login", last_synced_at: null, accounts: [] },
        { id: "ok", institution_name: "Bank 2", status: "ok", last_synced_at: null, accounts: [] },
        { id: "match", institution_name: "Bank 3", status: "pending_account_match", last_synced_at: null, accounts: [] }
      ]} />);
    for (const copy of ["Connect a bank", "Sign in again"]) {
      if (nativeApp) expect(html).not.toContain(copy); else expect(html).toContain(copy);
    }
    expect(html.includes("To connect a bank, use Domus on a computer for now.")).toBe(nativeApp);
    for (const copy of ["Refresh", "Disconnect", "Finish connecting"]) expect(html).toContain(copy);
  });
});
