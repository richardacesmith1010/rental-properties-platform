import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { OAuthReturn } from "../oauth-return";
import { saveLinkSession } from "../link-session";
import { loadPlaidScript } from "../plaid-script";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("../plaid-script", () => ({ loadPlaidScript: vi.fn() }));
const actions = { finish: vi.fn(), finishRelink: vi.fn() };
type Config = Parameters<NonNullable<Window["Plaid"]>["create"]>[0];
let config: Config;
let create: Mock<NonNullable<Window["Plaid"]>["create"]>;
let open: Mock<() => void>;
const key = "domus.plaidLink";
function save(startedAt = Date.now()) {
  saveLinkSession({ linkToken: "synthetic-link", mode: "create", ownerAccountId: "owner", startedAt });
}
async function start() {
  save();
  const view = render(<OAuthReturn actions={actions} />);
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  return view;
}
function expectBack() {
  expect(screen.getByRole("link", { name: "Back to your banks" })).toHaveAttribute("href", "/owner/bank");
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  window.history.replaceState({}, "", "/owner/bank/oauth?oauth_state_id=abc-123");
  vi.mocked(loadPlaidScript).mockResolvedValue(undefined);
  actions.finish.mockResolvedValue({ success: true });
  actions.finishRelink.mockResolvedValue({ success: true });
  open = vi.fn();
  create = vi.fn((value: Config) => { config = value; return { open }; });
  window.Plaid = { create };
});
afterEach(() => { vi.restoreAllMocks(); delete window.Plaid; });

describe("§8.4 OAuthReturn", () => {
  it("no session shows retry heading and back link", () => {
    render(<OAuthReturn actions={actions} />);
    expect(screen.getByRole("heading", { name: "Let's try that again" })).toBeInTheDocument();
    expectBack(); expect(create).not.toHaveBeenCalled();
  });
  it("StrictMode opens once with the same token and byte-for-byte receivedRedirectUri", async () => {
    save();
    render(<StrictMode><OAuthReturn actions={actions} /></StrictMode>);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
    expect(config.token).toBe("synthetic-link");
    expect(config.receivedRedirectUri).toBe(window.location.href);
    expect(config.receivedRedirectUri).toContain("?oauth_state_id=abc-123");
  });
  it("expired session is cleared", () => {
    save(Date.now() - 1_800_001); render(<OAuthReturn actions={actions} />);
    expect(localStorage.getItem(key)).toBeNull(); expectBack();
    expect(create).not.toHaveBeenCalled();
  });
  it.each([false, true])("success (needsMatch=%s) finishes, clears, then replaces", async (needsMatch) => {
    actions.finish.mockImplementation(async () => {
      expect(localStorage.getItem(key)).not.toBeNull(); return { success: true, needsMatch };
    });
    mocks.replace.mockImplementation(() => expect(localStorage.getItem(key)).toBeNull());
    await start();
    await act(async () => config.onSuccess("synthetic-public", { accounts: [{ id: "a" }] }));
    expect(actions.finish).toHaveBeenCalledWith({ ownerAccountId: "owner", publicToken: "synthetic-public",
      selectedAccountIds: ["a"] });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/owner/bank");
  });
  it.each(["returned", "fallback", "thrown"])("%s finish failure clears, shows error and never replaces", async (kind) => {
    if (kind === "thrown") actions.finish.mockImplementation(() => { throw new Error("private failure"); });
    else actions.finish.mockResolvedValue({ success: false, error: kind === "returned" ? "Access denied" : undefined });
    await start(); await act(async () => config.onSuccess("synthetic-public", {}));
    expect(localStorage.getItem(key)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(kind === "returned" ? "Access denied" : "Try again.");
    expectBack(); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("duplicate success and late exit finish and navigate only once", async () => {
    await start();
    await act(async () => {
      config.onSuccess("synthetic-public", {}); config.onSuccess("synthetic-public", {}); config.onExit?.(null);
    });
    act(() => config.onExit?.(null));
    expect(actions.finish).toHaveBeenCalledTimes(1); expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  it("actual remount during finish reuses pending work without opening or finishing twice", async () => {
    let resolve!: (value: { success: boolean }) => void;
    actions.finish.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = await start();
    await act(async () => config.onSuccess("synthetic-public", {}));
    first.unmount(); render(<OAuthReturn actions={actions} />);
    await act(async () => resolve({ success: true }));
    expect(actions.finish).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/owner/bank");
  });
  it("exit clears and replaces once without finishing", async () => {
    await start(); act(() => { config.onExit?.(null); config.onExit?.(null); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/owner/bank"); expect(actions.finish).not.toHaveBeenCalled();
  });
  it.each(["script", "missing", "create", "open"])("%s init failure clears and shows retry with back link", async (kind) => {
    if (kind === "script") vi.mocked(loadPlaidScript).mockRejectedValue(new Error("load failed"));
    if (kind === "missing") delete window.Plaid;
    if (kind === "create") create.mockImplementation(() => { throw new Error("create failed"); });
    if (kind === "open") open.mockImplementation(() => { throw new Error("open failed"); });
    save(); render(<OAuthReturn actions={actions} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again."));
    expect(localStorage.getItem(key)).toBeNull(); expectBack(); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("relink return uses the shared relink finish", async () => {
    saveLinkSession({ linkToken: "synthetic-link", mode: "relink", connectionId: "connection", startedAt: Date.now() });
    render(<OAuthReturn actions={actions} />); await waitFor(() => expect(open).toHaveBeenCalled());
    await act(async () => config.onSuccess("unused", {}));
    expect(actions.finishRelink).toHaveBeenCalledWith({ connectionId: "connection" });
    expect(actions.finish).not.toHaveBeenCalled();
  });
});
