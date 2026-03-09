import type { ComponentType } from "react";
import {
  AlertCircle,
  Building,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck,
  Flame,
  Home,
  Lock,
  ShieldCheck,
  Trophy,
  Wrench,
  Zap
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

interface AchievementCardProps {
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  earned: boolean;
  earnedAt?: string;
}

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  "credit-card": CreditCard,
  flame: Flame,
  "file-check": FileCheck,
  "building-2": Building2,
  buildings: Building,
  home: Home,
  zap: Zap,
  wrench: Wrench,
  "shield-check": ShieldCheck,
  "alert-circle": AlertCircle,
  trophy: Trophy
};

export function AchievementCard({
  title,
  description,
  icon,
  xpReward,
  earned,
  earnedAt
}: AchievementCardProps) {
  const Icon = iconMap[icon] ?? Trophy;

  return (
    <Card className={earned ? "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50" : "border-zinc-200 bg-zinc-50 opacity-60"}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={earned ? "rounded-xl bg-white p-2 text-amber-600 shadow-sm" : "rounded-xl bg-white p-2 text-zinc-400"}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-zinc-900">{title}</p>
              {earned ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Lock className="h-4 w-4 text-zinc-400" />
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-600">{description}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={earned ? "warning" : "outline"}>+{xpReward} XP</Badge>
              {earned && earnedAt ? (
                <span className="text-[11px] text-zinc-500">Earned {formatDate(earnedAt)}</span>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
