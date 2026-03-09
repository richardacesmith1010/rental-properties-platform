export type GamificationRole = "owner" | "manager" | "tenant";

export interface UserGamificationData {
  totalXp: number;
  currentLevel: number;
  streakCount: number;
  streakLastDate: string | null;
}

export interface AchievementDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  xpReward: number;
  thresholdValue: number;
  roleScope: string | null;
  earned: boolean;
  earnedAt: string | null;
}

export interface XpEventDTO {
  id: string;
  eventType: string;
  xpAmount: number;
  description: string | null;
  createdAt: string;
}

export const LEVEL_THRESHOLDS = [0, 500, 2000, 5000] as const;

export const LEVEL_TITLES: Record<GamificationRole, string[]> = {
  tenant: ["New Tenant", "Reliable Tenant", "Star Tenant", "Platinum Tenant"],
  owner: ["Starter Landlord", "Rising Landlord", "Portfolio Pro", "Property Mogul"],
  manager: ["New Manager", "Trusted Manager", "Senior Manager", "Operations Lead"]
};

export const XP_VALUES: Record<string, number> = {
  rent_paid_on_time: 100,
  rent_paid_late: 25,
  ticket_submitted: 25,
  ticket_resolved: 75,
  document_signed: 50,
  property_added: 200,
  unit_added: 100,
  lease_created: 150,
  tenant_invited: 50
};

function isMissingSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code) : null;
  return code === "42P01" || code === "42703" || code === "PGRST205";
}

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

export async function getUserGamification(userId: string): Promise<UserGamificationData> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("user_gamification")
      .select("total_xp, current_level, streak_count, streak_last_date")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        return {
          totalXp: 0,
          currentLevel: 1,
          streakCount: 0,
          streakLastDate: null
        };
      }

      throw error;
    }

    return {
      totalXp: data?.total_xp ?? 0,
      currentLevel: data?.current_level ?? 1,
      streakCount: data?.streak_count ?? 0,
      streakLastDate: data?.streak_last_date ?? null
    };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return {
        totalXp: 0,
        currentLevel: 1,
        streakCount: 0,
        streakLastDate: null
      };
    }

    console.error("Failed to fetch user gamification", error);
    return {
      totalXp: 0,
      currentLevel: 1,
      streakCount: 0,
      streakLastDate: null
    };
  }
}

export async function getUserAchievements(
  userId: string,
  role: string
): Promise<AchievementDTO[]> {
  try {
    const supabase = await getSupabase();
    const { data: achievements, error: achievementsError } = await supabase
      .from("achievements")
      .select("id, slug, title, description, icon, category, xp_reward, threshold_value, role_scope")
      .or(`role_scope.is.null,role_scope.eq.${role}`)
      .order("sort_order", { ascending: true });

    if (achievementsError) {
      if (isMissingSchemaError(achievementsError)) {
        return [];
      }

      throw achievementsError;
    }

    if (!achievements || achievements.length === 0) {
      return [];
    }

    const achievementIds = achievements.map((achievement) => achievement.id);
    const { data: earnedRows, error: earnedError } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", userId)
      .in("achievement_id", achievementIds);

    if (earnedError) {
      if (isMissingSchemaError(earnedError)) {
        return achievements.map((achievement) => ({
          id: achievement.id,
          slug: achievement.slug,
          title: achievement.title,
          description: achievement.description,
          icon: achievement.icon,
          category: achievement.category,
          xpReward: achievement.xp_reward,
          thresholdValue: achievement.threshold_value,
          roleScope: achievement.role_scope,
          earned: false,
          earnedAt: null
        }));
      }

      throw earnedError;
    }

    const earnedByAchievementId = new Map(
      (earnedRows ?? []).map((row) => [row.achievement_id, row.earned_at])
    );

    return achievements.map((achievement) => ({
      id: achievement.id,
      slug: achievement.slug,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      category: achievement.category,
      xpReward: achievement.xp_reward,
      thresholdValue: achievement.threshold_value,
      roleScope: achievement.role_scope,
      earned: earnedByAchievementId.has(achievement.id),
      earnedAt: earnedByAchievementId.get(achievement.id) ?? null
    }));
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }

    console.error("Failed to fetch user achievements", error);
    return [];
  }
}

export async function getRecentXpEvents(userId: string, limit = 10): Promise<XpEventDTO[]> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("xp_events")
      .select("id, event_type, xp_amount, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingSchemaError(error)) {
        return [];
      }

      throw error;
    }

    return (data ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      xpAmount: event.xp_amount,
      description: event.description,
      createdAt: event.created_at
    }));
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }

    console.error("Failed to fetch recent XP events", error);
    return [];
  }
}

export async function awardXp(
  userId: string,
  eventType: string,
  xpAmount: number,
  description?: string | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("award_xp", {
      p_user_id: userId,
      p_event_type: eventType,
      p_xp_amount: xpAmount,
      p_description: description ?? null,
      p_metadata: metadata
    });

    if (error) {
      if (isMissingSchemaError(error)) {
        return null;
      }

      throw error;
    }

    return data;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("Failed to award XP", error);
    }
    return null;
  }
}

export async function updateUserStreak(userId: string, action: "increment" | "reset" = "increment") {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("update_streak", {
      p_user_id: userId,
      p_action: action
    });

    if (error) {
      if (isMissingSchemaError(error)) {
        return null;
      }

      throw error;
    }

    return data;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("Failed to update streak", error);
    }
    return null;
  }
}

export function getLevelTitle(level: number, role: string): string {
  const normalizedRole = (role as GamificationRole) in LEVEL_TITLES
    ? (role as GamificationRole)
    : "tenant";
  return LEVEL_TITLES[normalizedRole][level - 1] ?? `Level ${level}`;
}

export function getNextLevelXp(currentLevel: number): number {
  return LEVEL_THRESHOLDS[currentLevel] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

export function getCurrentLevelXp(currentLevel: number): number {
  return LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
}
