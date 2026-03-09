import { describe, expect, it } from "vitest";
import {
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
  XP_VALUES,
  getCurrentLevelXp,
  getLevelTitle,
  getNextLevelXp,
  meetsAchievement,
  normalizeRole,
  type AchievementDTO
} from "@/lib/gamification";

function mockAchievement(slug: string, thresholdValue = 1): AchievementDTO {
  return {
    id: "test-id",
    slug,
    title: `Test ${slug}`,
    description: "Test description",
    icon: "star",
    category: "test",
    xpReward: 50,
    thresholdValue,
    roleScope: null,
    earned: false,
    earnedAt: null
  };
}

function emptyStats(): Parameters<typeof meetsAchievement>[1] {
  return {
    streakCount: 0,
    paymentCount: 0,
    ticketSubmittedCount: 0,
    ticketResolvedCount: 0,
    documentSignedCount: 0,
    propertyCount: 0,
    hasFullOccupancy: false,
    hasQuickResponse: false,
    hasSixMonthsWithoutLateFees: false
  };
}

describe("gamification constants", () => {
  it("XP_VALUES has 9 entries", () => {
    expect(Object.keys(XP_VALUES)).toHaveLength(9);
  });

  it("all XP values are positive", () => {
    expect(Object.values(XP_VALUES).every((value) => value > 0)).toBe(true);
  });

  it("LEVEL_THRESHOLDS are ascending", () => {
    expect([...LEVEL_THRESHOLDS]).toEqual([0, 500, 2000, 5000]);
  });

  it("LEVEL_TITLES has owner, manager, and tenant roles", () => {
    expect(Object.keys(LEVEL_TITLES).sort()).toEqual(["manager", "owner", "tenant"]);
  });

  it("each role has 4 level titles", () => {
    expect(Object.values(LEVEL_TITLES).every((titles) => titles.length === 4)).toBe(true);
  });
});

describe("normalizeRole", () => {
  it("returns owner for owner", () => {
    expect(normalizeRole("owner")).toBe("owner");
  });

  it("returns manager for manager", () => {
    expect(normalizeRole("manager")).toBe("manager");
  });

  it("returns tenant for tenant", () => {
    expect(normalizeRole("tenant")).toBe("tenant");
  });

  it("falls back to tenant for null", () => {
    expect(normalizeRole(null)).toBe("tenant");
  });

  it("falls back to tenant for undefined", () => {
    expect(normalizeRole(undefined)).toBe("tenant");
  });

  it("falls back to tenant for invalid strings", () => {
    expect(normalizeRole("admin")).toBe("tenant");
  });
});

describe("getLevelTitle", () => {
  const cases = [
    ["tenant", 1, "New Tenant"],
    ["tenant", 2, "Reliable Tenant"],
    ["tenant", 3, "Star Tenant"],
    ["tenant", 4, "Platinum Tenant"],
    ["owner", 1, "Starter Landlord"],
    ["owner", 2, "Rising Landlord"],
    ["owner", 3, "Portfolio Pro"],
    ["owner", 4, "Property Mogul"],
    ["manager", 1, "New Manager"],
    ["manager", 2, "Trusted Manager"],
    ["manager", 3, "Senior Manager"],
    ["manager", 4, "Operations Lead"]
  ] as const;

  for (const [role, level, title] of cases) {
    it(`returns ${title} for ${role} level ${level}`, () => {
      expect(getLevelTitle(level, role)).toBe(title);
    });
  }

  it("falls back to Level N for out-of-bounds levels", () => {
    expect(getLevelTitle(9, "tenant")).toBe("Level 9");
  });
});

describe("level XP helpers", () => {
  it("getNextLevelXp returns 500 for level 1", () => {
    expect(getNextLevelXp(1)).toBe(500);
  });

  it("getNextLevelXp returns 2000 for level 2", () => {
    expect(getNextLevelXp(2)).toBe(2000);
  });

  it("getNextLevelXp returns 5000 for level 3", () => {
    expect(getNextLevelXp(3)).toBe(5000);
  });

  it("getNextLevelXp caps at 5000 for level 4", () => {
    expect(getNextLevelXp(4)).toBe(5000);
  });

  it("getCurrentLevelXp returns 0 for level 1", () => {
    expect(getCurrentLevelXp(1)).toBe(0);
  });

  it("getCurrentLevelXp returns 500 for level 2", () => {
    expect(getCurrentLevelXp(2)).toBe(500);
  });

  it("getCurrentLevelXp returns 2000 for level 3", () => {
    expect(getCurrentLevelXp(3)).toBe(2000);
  });

  it("getCurrentLevelXp returns 5000 for level 4", () => {
    expect(getCurrentLevelXp(4)).toBe(5000);
  });
});

describe("meetsAchievement", () => {
  it("matches first_payment when payment count meets threshold", () => {
    const stats = { ...emptyStats(), paymentCount: 1 };
    expect(meetsAchievement(mockAchievement("first_payment", 1), stats)).toBe(true);
  });

  it("fails first_payment when payment count is below threshold", () => {
    expect(meetsAchievement(mockAchievement("first_payment", 1), emptyStats())).toBe(false);
  });

  it("matches streak_3 when streak meets threshold", () => {
    const stats = { ...emptyStats(), streakCount: 3 };
    expect(meetsAchievement(mockAchievement("streak_3", 3), stats)).toBe(true);
  });

  it("fails streak_3 when streak is below threshold", () => {
    const stats = { ...emptyStats(), streakCount: 2 };
    expect(meetsAchievement(mockAchievement("streak_3", 3), stats)).toBe(false);
  });

  it("matches streak_6 when streak meets threshold", () => {
    const stats = { ...emptyStats(), streakCount: 6 };
    expect(meetsAchievement(mockAchievement("streak_6", 6), stats)).toBe(true);
  });

  it("fails streak_6 when streak is below threshold", () => {
    const stats = { ...emptyStats(), streakCount: 5 };
    expect(meetsAchievement(mockAchievement("streak_6", 6), stats)).toBe(false);
  });

  it("matches streak_12 when streak meets threshold", () => {
    const stats = { ...emptyStats(), streakCount: 12 };
    expect(meetsAchievement(mockAchievement("streak_12", 12), stats)).toBe(true);
  });

  it("fails streak_12 when streak is below threshold", () => {
    const stats = { ...emptyStats(), streakCount: 11 };
    expect(meetsAchievement(mockAchievement("streak_12", 12), stats)).toBe(false);
  });

  it("matches quick_signer when document count meets threshold", () => {
    const stats = { ...emptyStats(), documentSignedCount: 1 };
    expect(meetsAchievement(mockAchievement("quick_signer", 1), stats)).toBe(true);
  });

  it("fails quick_signer when document count is below threshold", () => {
    expect(meetsAchievement(mockAchievement("quick_signer", 1), emptyStats())).toBe(false);
  });

  it("matches first_property when property count meets threshold", () => {
    const stats = { ...emptyStats(), propertyCount: 1 };
    expect(meetsAchievement(mockAchievement("first_property", 1), stats)).toBe(true);
  });

  it("fails first_property when property count is below threshold", () => {
    expect(meetsAchievement(mockAchievement("first_property", 1), emptyStats())).toBe(false);
  });

  it("matches portfolio_5 when property count meets threshold", () => {
    const stats = { ...emptyStats(), propertyCount: 5 };
    expect(meetsAchievement(mockAchievement("portfolio_5", 5), stats)).toBe(true);
  });

  it("fails portfolio_5 when property count is below threshold", () => {
    const stats = { ...emptyStats(), propertyCount: 4 };
    expect(meetsAchievement(mockAchievement("portfolio_5", 5), stats)).toBe(false);
  });

  it("matches full_occupancy when occupancy flag is true", () => {
    const stats = { ...emptyStats(), hasFullOccupancy: true };
    expect(meetsAchievement(mockAchievement("full_occupancy"), stats)).toBe(true);
  });

  it("fails full_occupancy when occupancy flag is false", () => {
    expect(meetsAchievement(mockAchievement("full_occupancy"), emptyStats())).toBe(false);
  });

  it("matches quick_responder when quick response flag is true", () => {
    const stats = { ...emptyStats(), hasQuickResponse: true };
    expect(meetsAchievement(mockAchievement("quick_responder"), stats)).toBe(true);
  });

  it("fails quick_responder when quick response flag is false", () => {
    expect(meetsAchievement(mockAchievement("quick_responder"), emptyStats())).toBe(false);
  });

  it("matches ticket_10 when resolved ticket count meets threshold", () => {
    const stats = { ...emptyStats(), ticketResolvedCount: 10 };
    expect(meetsAchievement(mockAchievement("ticket_10", 10), stats)).toBe(true);
  });

  it("fails ticket_10 when resolved ticket count is below threshold", () => {
    const stats = { ...emptyStats(), ticketResolvedCount: 9 };
    expect(meetsAchievement(mockAchievement("ticket_10", 10), stats)).toBe(false);
  });

  it("matches zero_late_6 when six-month late-fee flag is true", () => {
    const stats = { ...emptyStats(), hasSixMonthsWithoutLateFees: true };
    expect(meetsAchievement(mockAchievement("zero_late_6"), stats)).toBe(true);
  });

  it("fails zero_late_6 when six-month late-fee flag is false", () => {
    expect(meetsAchievement(mockAchievement("zero_late_6"), emptyStats())).toBe(false);
  });

  it("matches first_ticket when submitted ticket count meets threshold", () => {
    const stats = { ...emptyStats(), ticketSubmittedCount: 1 };
    expect(meetsAchievement(mockAchievement("first_ticket", 1), stats)).toBe(true);
  });

  it("fails first_ticket when submitted ticket count is below threshold", () => {
    expect(meetsAchievement(mockAchievement("first_ticket", 1), emptyStats())).toBe(false);
  });

  it("returns false for unknown achievement slugs", () => {
    const stats = {
      ...emptyStats(),
      streakCount: 100,
      paymentCount: 100,
      propertyCount: 100,
      documentSignedCount: 100,
      ticketSubmittedCount: 100,
      ticketResolvedCount: 100,
      hasFullOccupancy: true,
      hasQuickResponse: true,
      hasSixMonthsWithoutLateFees: true
    };
    expect(meetsAchievement(mockAchievement("unknown_slug", 1), stats)).toBe(false);
  });
});
