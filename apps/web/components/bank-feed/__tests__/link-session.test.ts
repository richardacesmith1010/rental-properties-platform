import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLinkSession, finishLinkSession, loadLinkSession, saveLinkSession } from "../link-session";

const key = "domus.plaidLink";
const now = 1_800_000_000_000;
const input = { linkToken: "synthetic-link", mode: "create" as const, ownerAccountId: "owner", startedAt: now };
const stored = { ...input, expiresAt: now + 1_800_000 };
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("§8.2 link-session localStorage", () => {
  it("round-trips across a fresh module instance (new tab)", async () => {
    expect(saveLinkSession(input)).toBe(true);
    expect(loadLinkSession(now)).toEqual(stored);
    vi.resetModules();
    const freshTab = await import("../link-session");
    expect(freshTab.loadLinkSession(now)).toEqual(stored);
  });
  it("round-trips relink and clear removes the key", () => {
    expect(saveLinkSession({ ...input, mode: "relink", connectionId: "connection" })).toBe(true);
    expect(loadLinkSession(now)?.connectionId).toBe("connection");
    clearLinkSession();
    expect(localStorage.getItem(key)).toBeNull();
    expect(loadLinkSession(now)).toBeNull();
  });
  it.each([1_800_000, 1_800_001])("expires and clears at age %s", (age) => {
    saveLinkSession(input);
    expect(loadLinkSession(now + age)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it.each([
    "broken", "null", "[]", "{}",
    JSON.stringify({ ...stored, ownerAccountId: undefined }),
    JSON.stringify({ ...stored, mode: "relink" }), JSON.stringify({ ...stored, mode: "other" }),
    JSON.stringify({ ...stored, ownerAccountId: 3 }), JSON.stringify({ ...stored, linkToken: "" }),
    JSON.stringify({ ...stored, startedAt: null }), JSON.stringify({ ...stored, expiresAt: null }),
    JSON.stringify({ ...stored, startedAt: "1800000000000" }),
    JSON.stringify({ ...stored, expiresAt: now + 1 }),
    JSON.stringify({ ...stored, startedAt: now + 60_001, expiresAt: now + 60_001 + 1_800_000 }),
    JSON.stringify(stored).replace(String(now), "1e999"),
    JSON.stringify(stored).replace(String(stored.expiresAt), "-1e999")
  ])("rejects and clears malformed session %#", (raw) => {
    localStorage.setItem(key, raw);
    expect(loadLinkSession(now)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("returns no session when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadLinkSession(now)).toBeNull();
    expect(saveLinkSession(input)).toBe(false);
  });
  it("fails closed when setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(saveLinkSession(input)).toBe(false);
  });
  it("fails closed when immediate read-back differs", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("different");
    expect(saveLinkSession(input)).toBe(false);
  });
  it("tolerates removeItem throwing", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => clearLinkSession()).not.toThrow();
  });
});

describe("§8.3 finishLinkSession", () => {
  it("create sends owner, public token, and selected account IDs only", async () => {
    const actions = { finish: vi.fn().mockResolvedValue({ success: true }), finishRelink: vi.fn() };
    await finishLinkSession(stored, "synthetic-public", { accounts: [{ id: "a" }, {}, { id: "b" }] }, actions);
    expect(actions.finish).toHaveBeenCalledWith({ ownerAccountId: "owner", publicToken: "synthetic-public",
      selectedAccountIds: ["a", "b"] });
    expect(actions.finishRelink).not.toHaveBeenCalled();
  });
  it("relink sends only connectionId", async () => {
    const actions = { finish: vi.fn(), finishRelink: vi.fn().mockResolvedValue({ success: true }) };
    await finishLinkSession({ ...stored, mode: "relink", connectionId: "connection" }, "unused", {}, actions);
    expect(actions.finishRelink).toHaveBeenCalledWith({ connectionId: "connection" });
    expect(actions.finish).not.toHaveBeenCalled();
  });
});
