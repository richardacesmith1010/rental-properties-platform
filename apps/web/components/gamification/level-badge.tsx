import { cn } from "@/lib/format";

interface LevelBadgeProps {
  level: number;
  role: "owner" | "manager" | "tenant";
  size?: "sm" | "md";
}

const LEVEL_TITLES: Record<"owner" | "manager" | "tenant", string[]> = {
  tenant: ["New Tenant", "Reliable Tenant", "Star Tenant", "Platinum Tenant"],
  owner: ["Starter Landlord", "Rising Landlord", "Portfolio Pro", "Property Mogul"],
  manager: ["New Manager", "Trusted Manager", "Senior Manager", "Operations Lead"]
};

const levelClasses: Record<number, string> = {
  1: "border border-violet-200 bg-violet-100 text-violet-700",
  2: "border border-emerald-200 bg-emerald-100 text-emerald-700",
  3: "border border-amber-200 bg-amber-100 text-amber-700",
  4: "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900 shadow-sm"
};

export function LevelBadge({ level, role, size = "md" }: LevelBadgeProps) {
  const title = LEVEL_TITLES[role][level - 1] ?? `Level ${level}`;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        levelClasses[level] ?? levelClasses[1]
      )}
    >
      {title}
    </div>
  );
}
