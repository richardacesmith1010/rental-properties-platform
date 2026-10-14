import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankConnectionsCard } from "../bank-connections-card";
import { openNativePlaidLink } from "../native-plaid-link";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const actions = { start: vi.fn(), finish: vi.fn(), startRelink: vi.fn(), finishRelink: vi.fn(),
  refresh: vi.fn(), disconnect: vi.fn(), confirm: vi.fn(), skip: vi.fn() };
const postMessage = vi.fn();
const connections = [{ id: "c", institution_name: "Bank", status: "needs_login", last_synced_at: null, accounts: [] }];
function card(nativeApp = true) {
  return <BankConnectionsCard ownerAccountId="owner" nativeApp={nativeApp} connections={connections} actions={actions} />;
}
function install() {
  Object.defineProperty(window, "webkit", { configurable: true, value: { messageHandlers: { domusPlaidLink: { postMessage } } } });
}
async function open(relink = false) {
  install(); render(card());
  fireEvent.click(screen.getByRole("button", { name: relink ? "Sign in again" : "Connect a bank" }));
  await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
  return postMessage.mock.calls[0][0].requestId;
}
async function reply(requestId: string, detail: object) {
  await act(async () => { window.dispatchEvent(new CustomEvent("domus-plaid-link", { detail: { requestId, ...detail } })); });
}
beforeEach(() => {
  vi.clearAllMocks();
  actions.start.mockResolvedValue({ success: true, linkToken: "link-synthetic" });
  actions.startRelink.mockResolvedValue({ success: true, linkToken: "link-synthetic-relink" });
  actions.finish.mockResolvedValue({ success: true }); actions.finishRelink.mockResolvedValue({ success: true });
});
afterEach(() => { Reflect.deleteProperty(window, "webkit"); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("229 §8.4 native card", () => {
  it("without handler shows fallback and no link buttons", () => {
    render(card());
    expect(screen.getByText("To connect a bank, use Domus on a computer for now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect a bank" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull();
  });
  it("with handler keeps fallback on first render and shows buttons only after mount", () => {
    install();
    const html = renderToString(card());
    expect(html).toContain("To connect a bank, use Domus on a computer for now.");
    expect(html).not.toContain("Connect a bank"); expect(html).not.toContain("Sign in again");
    render(card());
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeEnabled();
  });
  it("success maps accountIds, passes ios, refreshes and never accesses link storage", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem"), remove = vi.spyOn(Storage.prototype, "removeItem");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const id = await open();
    expect(actions.start).toHaveBeenCalledWith({ ownerAccountId: "owner", platform: "ios" });
    expect(postMessage).toHaveBeenCalledWith({ action: "open", requestId: id, linkToken: "link-synthetic" });
    await reply(id, { status: "success", publicToken: "public-synthetic", accountIds: ["a", "b"] });
    expect(actions.finish).toHaveBeenCalledWith({ ownerAccountId: "owner", publicToken: "public-synthetic",
      selectedAccountIds: ["a", "b"] });
    expect(refresh).toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it("relink success calls finishRelink", async () => {
    const id = await open(true);
    expect(actions.startRelink).toHaveBeenCalledWith({ connectionId: "c", platform: "ios" });
    await reply(id, { status: "success", publicToken: "public-synthetic", accountIds: [] });
    expect(actions.finishRelink).toHaveBeenCalledWith({ connectionId: "c" });
    expect(actions.finish).not.toHaveBeenCalled();
  });
  it("ignores wrong requestId, exits without error, and removes the listener", async () => {
    const id = await open();
    await reply("wrong", { status: "success", publicToken: "public-synthetic", accountIds: ["a"] });
    expect(actions.finish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeDisabled();
    await reply(id, { status: "exit" });
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    await reply(id, { status: "success", publicToken: "public-synthetic", accountIds: ["a"] });
    expect(actions.finish).not.toHaveBeenCalled();
  });
  it("error shows Try again and never clears storage", async () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const id = await open(); await reply(id, { status: "error" });
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeEnabled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("native needsMatch uses the existing matching UI", async () => {
    actions.finish.mockResolvedValueOnce({ success: true, needsMatch: true, connectionId: "c",
      plaidAccounts: [{ id: "a", nickname: "Checking", institution: "bank" }], uploadAccounts: [] });
    const id = await open(); await reply(id, { status: "success", publicToken: "public-synthetic", accountIds: ["a"] });
    expect(screen.getByRole("heading", { name: "Is this the same account as one you uploaded before?" })).toBeInTheDocument();
  });
  it.each(["returned", "thrown"])("native finish %s failure stops busy with error", async (mode) => {
    if (mode === "returned") actions.finish.mockResolvedValueOnce({ success: false, error: "Try again." });
    else actions.finish.mockRejectedValueOnce(new Error("synthetic"));
    const id = await open(); await reply(id, { status: "success", publicToken: "public-synthetic", accountIds: ["a"] });
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeEnabled();
  });
  it("30 minute timeout silently stops busy", async () => {
    vi.useFakeTimers(); install(); render(card());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Connect a bank" })); });
    await act(async () => { vi.advanceTimersByTime(30 * 60 * 1000); });
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("post failure resolves as error and cancels its timeout", async () => {
    vi.useFakeTimers(); install(); postMessage.mockImplementationOnce(() => { throw new Error("synthetic"); });
    await expect(openNativePlaidLink("link-synthetic")).resolves.toEqual({ status: "error" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
