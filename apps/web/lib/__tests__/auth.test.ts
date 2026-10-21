import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } })
}));

import { getAuthenticatedUser } from "@/lib/auth";

describe("getAuthenticatedUser return navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  });

  it.each([
    ["/owner/money?year=2026", "/login?next=%2Fowner%2Fmoney%3Fyear%3D2026"],
    ["/login", "/login"], [null, "/login"]
  ])("S5 redirects a signed-out request with header %s", async (path, destination) => {
    const values = new Headers();
    if (path) values.set("x-domus-path", path);
    mocks.headers.mockResolvedValue(values);
    await expect(getAuthenticatedUser()).rejects.toThrow(`REDIRECT:${destination}`);
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
  });
});
