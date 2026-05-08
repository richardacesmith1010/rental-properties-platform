import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import {
  getRecentXpEvents,
  getUserAchievements,
  getUserGamification,
} from "@/lib/gamification";
import { AchievementCard } from "@/components/gamification/achievement-card";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { StreakHeatmap } from "@/components/gamification/streak-heatmap";
import { XpBar } from "@/components/gamification/xp-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedList } from "@/components/ui/animated-list";
import { CountUp } from "@/components/ui/count-up";

export const dynamic = "force-dynamic";

const categoryLabels: Record<string, string> = {
  payments: "Payment Streaks",
  maintenance: "Maintenance",
  documents: "Documents",
  property: "Property",
  operations: "Operations",
  general: "General",
};

function domMessage(count: number, total: number) {
  if (count >= total && total > 0) {
    return "You're a Domus legend! Keep the streak alive.";
  }
  if (count >= 8) {
    return "Almost there. A few more wins and the whole board is yours.";
  }
  if (count >= 3) {
    return "Nice progress. The portfolio is responding to your momentum.";
  }
  return "You're just getting started. Small actions add up fast.";
}

export default async function AchievementsPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (!["owner", "manager", "tenant"].includes(role)) {
    redirect(getRoleHomePath(role));
  }

  const [gamification, achievements, events] = await Promise.all([
    getUserGamification(user.id),
    getUserAchievements(user.id, role),
    getRecentXpEvents(user.id, 400),
  ]);

  const earnedCount = achievements.filter((achievement) => achievement.earned).length;
  const grouped = achievements.reduce<Record<string, typeof achievements>>((groups, achievement) => {
    const key = achievement.category || "general";
    groups[key] = [...(groups[key] ?? []), achievement];
    return groups;
  }, {});

  return (
    <main id="main-content" className="app-surface min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-3xl bg-violet-100/80 px-4 py-3">
              <DomMascot size="lg" mood={earnedCount === achievements.length ? "celebrating" : "encouraging"} animate />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="warning">Achievements</Badge>
                <Badge variant="outline" className="capitalize">
                  {role}
                </Badge>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Achievement gallery</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">{domMessage(earnedCount, achievements.length)}</p>
              <p className="mt-3 text-sm font-medium text-zinc-700">
                <CountUp target={earnedCount} />/<CountUp target={achievements.length} /> achievements unlocked
              </p>
            </div>
          </div>
          <div className="w-full max-w-md rounded-2xl border border-violet-100/80 bg-white/90 p-4 shadow-sm">
            <XpBar currentXp={gamification.totalXp} currentLevel={gamification.currentLevel} />
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>Current streak</span>
              <span>
                <CountUp target={gamification.streakCount} /> {gamification.streakCount === 1 ? "day" : "days"}
              </span>
            </div>
            <div className="mt-4">
              <Link
                href={getRoleHomePath(role)}
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-800"
              >
                <Trophy className="h-4 w-4" />
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Streak heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <StreakHeatmap events={events} />
          </CardContent>
        </Card>

        <AnimatedList className="flex flex-wrap gap-2">
          {Object.keys(grouped).map((category) => (
            <a
              key={category}
              href={`#category-${category}`}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:border-violet-200 hover:text-violet-700"
            >
              {categoryLabels[category] ?? category}
            </a>
          ))}
        </AnimatedList>

        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} id={`category-${category}`} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{categoryLabels[category] ?? category}</h2>
              <p className="text-sm text-zinc-500">
                <CountUp target={items.filter((item) => item.earned).length} />/<CountUp target={items.length} /> unlocked
              </p>
            </div>
            <AnimatedList className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  title={achievement.title}
                  description={achievement.description}
                  icon={achievement.icon}
                  xpReward={achievement.xpReward}
                  earned={achievement.earned}
                  earnedAt={achievement.earnedAt ?? undefined}
                />
              ))}
            </AnimatedList>
          </section>
        ))}
      </div>
    </main>
  );
}
