import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
  getCurrentUserRole: vi.fn(async () => "owner"),
  getRoleHomePath: vi.fn((role: string) => `/${role}`)
}));

describe("AchievementsPage", () => {
  it("redirects old links to the user's role home", async () => {
    const { default: AchievementsPage } = await import("@/app/achievements/page");
    await AchievementsPage();
    expect(redirectMock).toHaveBeenCalledWith("/owner");
  });
});
