import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));

import { middleware } from "@/middleware";

describe("middleware session-expired cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function sessionCookie(path: string, cookie?: string) {
    const request = new NextRequest(`http://localhost${path}`, {
      headers: cookie ? { cookie } : undefined
    });
    return (await middleware(request)).cookies.get("x-session-expired");
  }

  it("does not show an expiry to a new visitor on a protected route", async () => {
    expect(await sessionCookie("/owner")).toBeUndefined();
    expect(await sessionCookie("/owner", "theme=dark")).toBeUndefined();
  });

  it.each(["sb-xyz-auth-token=stale", "sb-xyz-auth-token.0=stale"])(
    "shows an expiry when %s is carried to a protected route",
    async (cookie) => {
      expect(await sessionCookie("/owner", cookie)).toMatchObject({ value: "1", maxAge: 10 });
    }
  );

  it("does not show an expiry to a signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    expect(await sessionCookie("/owner", "sb-xyz-auth-token=valid")).toBeUndefined();
  });

  it("does not show an expiry on a public route", async () => {
    expect(await sessionCookie("/login", "sb-xyz-auth-token=stale")).toBeUndefined();
  });
});
