import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const getCurrentUserRoleMock = vi.hoisted(() => vi.fn());
const getRoleHomePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: getCurrentUserRoleMock,
  getRoleHomePath: getRoleHomePathMock
}));

import { requireAuth } from "@/app/actions/auth-helpers";

describe("requireAuth", () => {
  const authGetUserMock = vi.fn();
  const mockSupabase = {
    auth: {
      getUser: authGetUserMock
    }
  } as unknown as SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue(mockSupabase);
    getRoleHomePathMock.mockReturnValue("/tenant");
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("returns the user and role for an authenticated user", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } }
    });
    getCurrentUserRoleMock.mockResolvedValue("owner");

    const result = await requireAuth("owner");

    expect(result.user).toEqual({ id: "user-1", email: "owner@example.com" });
    expect(result.role).toBe("owner");
  });

  it("redirects to /login when no authenticated user exists", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: null }
    });

    await expect(requireAuth("owner")).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to the role home path when the role is not allowed", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "tenant@example.com" } }
    });
    getCurrentUserRoleMock.mockResolvedValue("tenant");
    getRoleHomePathMock.mockReturnValue("/tenant");

    await expect(requireAuth("owner", "manager")).rejects.toThrow("REDIRECT:/tenant");
  });

  it("accepts a single allowed role", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "manager@example.com" } }
    });
    getCurrentUserRoleMock.mockResolvedValue("manager");

    const result = await requireAuth("manager");

    expect(result.role).toBe("manager");
  });

  it("accepts multiple allowed roles", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "manager@example.com" } }
    });
    getCurrentUserRoleMock.mockResolvedValue("manager");

    const result = await requireAuth("owner", "manager");

    expect(result.role).toBe("manager");
  });

  it("returns the supabase client instance", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } }
    });
    getCurrentUserRoleMock.mockResolvedValue("owner");

    const result = await requireAuth("owner");

    expect(result.supabase).toBe(mockSupabase);
  });
});
