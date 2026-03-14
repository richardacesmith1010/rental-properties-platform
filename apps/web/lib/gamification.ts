import { getAdministeredPropertyIds } from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase-errors";

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

interface AchievementStats {
  streakCount: number;
  paymentCount: number;
  ticketSubmittedCount: number;
  ticketResolvedCount: number;
  documentSignedCount: number;
  propertyCount: number;
  hasFullOccupancy: boolean;
  hasQuickResponse: boolean;
  hasSixMonthsWithoutLateFees: boolean;
}

export function normalizeRole(role: string | null | undefined): GamificationRole {
  return role === "owner" || role === "manager" || role === "tenant" ? role : "tenant";
}

function emptyGamification(): UserGamificationData {
  return {
    totalXp: 0,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  };
}

async function getUserRole(userId: string, roleOverride?: string): Promise<GamificationRole> {
  if (roleOverride) {
    return normalizeRole(roleOverride);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    console.error("Failed to resolve user role for gamification", error);
  }

  return normalizeRole(data?.role);
}

async function getXpEventCounts(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("xp_events")
    .select("event_type")
    .eq("user_id", userId);

  if (error) {
    if (isMissingSchemaError(error)) {
      return new Map<string, number>();
    }

    throw error;
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1);
  }
  return counts;
}

async function getUserGamificationAdmin(userId: string): Promise<UserGamificationData> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_gamification")
    .select("total_xp, current_level, streak_count, streak_last_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) {
      return emptyGamification();
    }

    throw error;
  }

  return {
    totalXp: data?.total_xp ?? 0,
    currentLevel: data?.current_level ?? 1,
    streakCount: data?.streak_count ?? 0,
    streakLastDate: data?.streak_last_date ?? null
  };
}

async function getUserAchievementsAdmin(
  userId: string,
  role: GamificationRole
): Promise<AchievementDTO[]> {
  const admin = createAdminClient();
  const { data: achievements, error: achievementsError } = await admin
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

  if (!achievements?.length) {
    return [];
  }

  const { data: earnedRows, error: earnedError } = await admin
    .from("user_achievements")
    .select("achievement_id, earned_at")
    .eq("user_id", userId)
    .in("achievement_id", achievements.map((achievement) => achievement.id));

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

  const earnedById = new Map(
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
    earned: earnedById.has(achievement.id),
    earnedAt: earnedById.get(achievement.id) ?? null
  }));
}

async function getAchievementStats(userId: string, role: GamificationRole): Promise<AchievementStats> {
  const admin = createAdminClient();
  const [gamification, xpEventCounts] = await Promise.all([
    getUserGamificationAdmin(userId),
    getXpEventCounts(userId)
  ]);

  const paymentCount =
    (xpEventCounts.get("rent_paid_on_time") ?? 0) +
    (xpEventCounts.get("rent_paid_late") ?? 0);
  const ticketSubmittedCount = xpEventCounts.get("ticket_submitted") ?? 0;
  const ticketResolvedCount = xpEventCounts.get("ticket_resolved") ?? 0;
  const documentSignedCount = xpEventCounts.get("document_signed") ?? 0;

  let propertyCount = xpEventCounts.get("property_added") ?? 0;
  let hasFullOccupancy = false;
  let hasQuickResponse = ticketResolvedCount > 0;
  let hasSixMonthsWithoutLateFees = false;

  if (role === "owner" || role === "manager") {
    const propertyIds = await getAdministeredPropertyIds(userId);
    propertyCount = Math.max(propertyCount, propertyIds.length);

    if (propertyIds.length > 0) {
      const [{ data: units, error: unitsError }, { data: tickets, error: ticketsError }] =
        await Promise.all([
          admin
            .from("units")
            .select("id, occupied")
            .in("property_id", propertyIds),
          admin
            .from("maintenance_tickets")
            .select("created_at, resolved_at")
            .in("property_id", propertyIds)
            .not("resolved_at", "is", null)
        ]);

      if (unitsError && !isMissingSchemaError(unitsError)) {
        throw unitsError;
      }
      if (ticketsError && !isMissingSchemaError(ticketsError)) {
        throw ticketsError;
      }

      const unitIds = (units ?? []).map((unit) => unit.id);
      const { data: leases, error: leasesError } = unitIds.length
        ? await admin
            .from("leases")
            .select("id")
            .in("unit_id", unitIds)
        : { data: [] as Array<{ id: string }>, error: null };

      if (leasesError && !isMissingSchemaError(leasesError)) {
        throw leasesError;
      }

      const leaseIds = (leases ?? []).map((lease) => lease.id);
      const { data: lateFees, error: lateFeesError } = leaseIds.length
        ? await admin
            .from("rent_charges")
            .select("id")
            .eq("category", "late_fee")
            .in("lease_id", leaseIds)
            .gte(
              "due_date",
              new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            )
        : { data: [] as Array<{ id: string }>, error: null };

      if (lateFeesError && !isMissingSchemaError(lateFeesError)) {
        throw lateFeesError;
      }

      hasFullOccupancy = Boolean(units?.length) && (units ?? []).every((unit) => unit.occupied);
      hasQuickResponse =
        (tickets ?? []).some((ticket) => {
          if (!ticket.created_at || !ticket.resolved_at) {
            return false;
          }

          const createdAt = new Date(ticket.created_at).getTime();
          const resolvedAt = new Date(ticket.resolved_at).getTime();
          return resolvedAt - createdAt <= 24 * 60 * 60 * 1000;
        }) || hasQuickResponse;
      hasSixMonthsWithoutLateFees = leaseIds.length > 0 && (lateFees?.length ?? 0) === 0;
    }
  }

  if (role === "tenant") {
    const { data: leases, error: leaseError } = await admin
      .from("leases")
      .select("id")
      .eq("tenant_profile_id", userId);

    if (leaseError && !isMissingSchemaError(leaseError)) {
      throw leaseError;
    }

    const leaseIds = (leases ?? []).map((lease) => lease.id);
    if (leaseIds.length > 0) {
      const { data: lateFees, error: lateFeesError } = await admin
        .from("rent_charges")
        .select("id")
        .eq("category", "late_fee")
        .in("lease_id", leaseIds)
        .gte(
          "due_date",
          new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        );

      if (lateFeesError && !isMissingSchemaError(lateFeesError)) {
        throw lateFeesError;
      }

      hasSixMonthsWithoutLateFees = (lateFees?.length ?? 0) === 0;
    }
  }

  return {
    streakCount: gamification.streakCount,
    paymentCount,
    ticketSubmittedCount,
    ticketResolvedCount,
    documentSignedCount,
    propertyCount,
    hasFullOccupancy,
    hasQuickResponse,
    hasSixMonthsWithoutLateFees
  };
}

export function meetsAchievement(achievement: AchievementDTO, stats: AchievementStats) {
  switch (achievement.slug) {
    case "first_payment":
      return stats.paymentCount >= achievement.thresholdValue;
    case "streak_3":
    case "streak_6":
    case "streak_12":
      return stats.streakCount >= achievement.thresholdValue;
    case "quick_signer":
      return stats.documentSignedCount >= achievement.thresholdValue;
    case "first_property":
    case "portfolio_5":
      return stats.propertyCount >= achievement.thresholdValue;
    case "full_occupancy":
      return stats.hasFullOccupancy;
    case "quick_responder":
      return stats.hasQuickResponse;
    case "ticket_10":
      return stats.ticketResolvedCount >= achievement.thresholdValue;
    case "zero_late_6":
      return stats.hasSixMonthsWithoutLateFees;
    case "first_ticket":
      return stats.ticketSubmittedCount >= achievement.thresholdValue;
    default:
      return false;
  }
}

async function awardXpInternal(
  userId: string,
  eventType: string,
  xpAmount: number,
  description?: string | null,
  metadata: Record<string, unknown> = {},
  shouldCheckAchievements = true
) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("award_xp", {
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

    if (shouldCheckAchievements) {
      await checkAndAwardAchievements(userId);
    }

    return data;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("Failed to award XP", error);
    }
    return null;
  }
}

export async function getUserGamification(userId: string): Promise<UserGamificationData> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_gamification")
      .select("total_xp, current_level, streak_count, streak_last_date")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) {
        return emptyGamification();
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
    if (!isMissingSchemaError(error)) {
      console.error("Failed to fetch user gamification", error);
    }
    return emptyGamification();
  }
}

export async function getUserAchievements(userId: string, role: string): Promise<AchievementDTO[]> {
  try {
    const supabase = createClient();
    const normalizedRole = normalizeRole(role);
    const { data: achievements, error: achievementsError } = await supabase
      .from("achievements")
      .select("id, slug, title, description, icon, category, xp_reward, threshold_value, role_scope")
      .or(`role_scope.is.null,role_scope.eq.${normalizedRole}`)
      .order("sort_order", { ascending: true });

    if (achievementsError) {
      if (isMissingSchemaError(achievementsError)) {
        return [];
      }

      throw achievementsError;
    }

    if (!achievements?.length) {
      return [];
    }

    const { data: earnedRows, error: earnedError } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", userId)
      .in("achievement_id", achievements.map((achievement) => achievement.id));

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

    const earnedById = new Map(
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
      earned: earnedById.has(achievement.id),
      earnedAt: earnedById.get(achievement.id) ?? null
    }));
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("Failed to fetch user achievements", error);
    }
    return [];
  }
}

export async function getRecentXpEvents(userId: string, limit = 10): Promise<XpEventDTO[]> {
  try {
    const supabase = createClient();
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
    if (!isMissingSchemaError(error)) {
      console.error("Failed to fetch recent XP events", error);
    }
    return [];
  }
}

export async function checkAndAwardAchievements(
  userId: string,
  roleOverride?: string
): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const role = await getUserRole(userId, roleOverride);
    const [achievements, stats] = await Promise.all([
      getUserAchievementsAdmin(userId, role),
      getAchievementStats(userId, role)
    ]);

    const newTitles: string[] = [];

    for (const achievement of achievements) {
      if (achievement.earned || !meetsAchievement(achievement, stats)) {
        continue;
      }

      const { error } = await admin.from("user_achievements").upsert(
        {
          user_id: userId,
          achievement_id: achievement.id,
          earned_at: new Date().toISOString()
        },
        { onConflict: "user_id,achievement_id" }
      );

      if (error) {
        if (!isMissingSchemaError(error)) {
          console.error("Failed to record achievement", achievement.slug, error);
        }
        continue;
      }

      newTitles.push(achievement.title);

      if (achievement.xpReward > 0) {
        await awardXpInternal(
          userId,
          `achievement_${achievement.slug}`,
          achievement.xpReward,
          `Achievement unlocked: ${achievement.title}`,
          {
            achievement_id: achievement.id,
            achievement_slug: achievement.slug
          },
          false
        );
      }
    }

    return newTitles;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("Failed to check achievements", error);
    }
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
  return awardXpInternal(userId, eventType, xpAmount, description, metadata, true);
}

export async function updateUserStreak(
  userId: string,
  action: "increment" | "reset" = "increment"
) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("update_streak", {
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
  const normalizedRole = normalizeRole(role);
  return LEVEL_TITLES[normalizedRole][level - 1] ?? `Level ${level}`;
}

export function getNextLevelXp(currentLevel: number): number {
  return LEVEL_THRESHOLDS[currentLevel] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

export function getCurrentLevelXp(currentLevel: number): number {
  return LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
}
