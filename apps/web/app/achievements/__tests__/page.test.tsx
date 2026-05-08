import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRecentXpEvents,
  getUserAchievements,
  getUserGamification
} from "@/lib/gamification";

vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
  getCurrentUserRole: vi.fn(async () => "owner"),
  getRoleHomePath: vi.fn((role: string) => `/${role}`)
}));

vi.mock("@/lib/gamification", () => ({
  getRecentXpEvents: vi.fn(),
  getUserAchievements: vi.fn(),
  getUserGamification: vi.fn()
}));

vi.mock("@/components/ui/count-up", () => ({
  CountUp: ({ target }: { target: number }) => <span>{target}</span>
}));

vi.mock("@/components/gamification/achievement-card", () => ({
  AchievementCard: ({ title }: { title: string }) => <div>{title}</div>
}));

vi.mock("@/components/gamification/dom-mascot", () => ({
  DomMascot: () => <div>Dom</div>
}));

vi.mock("@/components/gamification/streak-heatmap", () => ({
  StreakHeatmap: () => <div>Heatmap</div>
}));

vi.mock("@/components/gamification/xp-bar", () => ({
  XpBar: () => <div>XP</div>
}));

vi.mock("@/components/ui/animated-list", () => ({
  AnimatedList: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

describe("AchievementsPage", () => {
  beforeEach(() => {
    vi.mocked(getRecentXpEvents).mockResolvedValue([]);
    vi.mocked(getUserAchievements).mockResolvedValue([
      {
        id: "achievement-1",
        category: "general",
        title: "First Win",
        description: "Complete your first action.",
        icon: "trophy",
        xpReward: 10,
        earned: true,
        earnedAt: null
      }
    ] as never);
  });

  it("renders the singular streak label for one day", async () => {
    vi.mocked(getUserGamification).mockResolvedValue({
      totalXp: 100,
      currentLevel: 2,
      streakCount: 1,
      streakLastDate: "2026-05-08"
    } as never);

    const { default: AchievementsPage } = await import("@/app/achievements/page");
    render(await AchievementsPage());

    expect(screen.getByText((_, element) => element?.textContent === "1 day")).toBeInTheDocument();
  });

  it("renders the plural streak label for multiple days", async () => {
    vi.mocked(getUserGamification).mockResolvedValue({
      totalXp: 100,
      currentLevel: 2,
      streakCount: 2,
      streakLastDate: "2026-05-08"
    } as never);

    const { default: AchievementsPage } = await import("@/app/achievements/page");
    render(await AchievementsPage());

    expect(screen.getByText((_, element) => element?.textContent === "2 days")).toBeInTheDocument();
  });
});
