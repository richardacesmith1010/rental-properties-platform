import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), rows: vi.fn(), profile: vi.fn(), headers: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: m.headers }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.getUser },
  from: (table: string) => table === "legal_acceptances" ? { select: m.rows }
    : { select: () => ({ eq: () => ({ maybeSingle: m.profile }) }) } }) }));
import { getAuthenticatedUser } from "@/lib/auth";
import { requireAuth, requireAuthForExit } from "../auth-helpers";
const user = { id: "p", email: "trusted@example.com", created_at: "2026-10-30T12:00:00Z" };
const current = { profile_id: "p", terms_version: "2026-10-30", privacy_version: "2026-10-30" };
beforeEach(() => {
  vi.clearAllMocks(); m.getUser.mockResolvedValue({ data: { user }, error: null });
  m.rows.mockResolvedValue({ data: [], error: null }); m.profile.mockResolvedValue({ data: { role: "tenant" }, error: null });
  m.headers.mockResolvedValue(new Headers({ "x-domus-path": "/tenant" }));
  m.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
describe("agreement page and action gates", () => {
  it("G1 current-version row returns the authenticated user", async () => {
    m.rows.mockResolvedValue({ data: [current], error: null }); expect(await getAuthenticatedUser()).toEqual(user);
  });
  it.each([["G2", [{ ...current, terms_version: "old" }]], ["G3,G3b", []],
    ["G5", [{ ...current, profile_id: "other" }]]])("%s redirects required accounts with safe next", async (_id, rows) => {
    m.rows.mockResolvedValue({ data: rows, error: null });
    await expect(getAuthenticatedUser()).rejects.toThrow("REDIRECT:/agree?next=%2Ftenant");
  });
  it("G4 older accounts do not read; exactly the cutoff is required", async () => {
    m.getUser.mockResolvedValue({ data: { user: { ...user, created_at: "2026-10-29T23:59:59Z" } }, error: null });
    m.rows.mockRejectedValue(new Error("must not read"));
    expect((await getAuthenticatedUser()).id).toEqual("p"); expect(m.rows).not.toHaveBeenCalled();
    m.getUser.mockResolvedValue({ data: { user: { ...user, created_at: "2026-10-30T00:00:00Z" } }, error: null });
    m.rows.mockResolvedValue({ data: [], error: null }); await expect(getAuthenticatedUser()).rejects.toThrow("REDIRECT:/agree");
  });
  it("G6 skip does not read", async () => {
    expect(await getAuthenticatedUser({ legal: "skip" })).toEqual(user); expect(m.rows).not.toHaveBeenCalled();
  });
  it("G7 no user redirects to login and never starts an agreement read", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null });
    m.rows.mockRejectedValue(new Error("must not read"));
    await expect(getAuthenticatedUser()).rejects.toThrow("REDIRECT:/login?next=%2Ftenant"); expect(m.rows).not.toHaveBeenCalled();
  });
  it("G8 a failed required read throws while the parallel headers call settles", async () => {
    m.rows.mockRejectedValue(new Error("agreement read failed"));
    m.headers.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return new Headers(); });
    await expect(getAuthenticatedUser()).rejects.toThrow("agreement read failed");
  });
  it("G9 a role change leaves a current acceptance valid", async () => {
    m.rows.mockResolvedValue({ data: [current], error: null }); m.profile.mockResolvedValue({ data: { role: "owner" }, error: null });
    expect((await getAuthenticatedUser()).id).toEqual("p");
  });
  it("G10 action gate redirects, returns accepted, and exempts old accounts", async () => {
    await expect(requireAuth("tenant")).rejects.toThrow("REDIRECT:/agree?next=%2Ftenant");
    m.rows.mockResolvedValue({ data: [current], error: null }); expect((await requireAuth("tenant")).user.email).toEqual(user.email);
    m.rows.mockClear(); m.getUser.mockResolvedValue({ data: { user: { ...user, created_at: "2026-10-29" } }, error: null });
    expect((await requireAuth("tenant")).user.id).toEqual("p"); expect(m.rows).not.toHaveBeenCalled();
  });
  it("G11 exit authentication retains trusted email and never reads agreements", async () => {
    expect((await requireAuthForExit("tenant")).user).toEqual({ id: "p", email: "trusted@example.com" });
    expect(m.rows).not.toHaveBeenCalled();
  });
});
