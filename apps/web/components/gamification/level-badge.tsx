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
  1: "border border-[var(--accent-line)] bg-[var(--accent-weak)] text-[var(--accent)]",
  2: "border border-[var(--pos)] bg-[var(--pos-bg)] text-[var(--pos)]",
  3: "border border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)]",
  4: "border border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)] shadow-[var(--domus-shadow-sm)]"
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
