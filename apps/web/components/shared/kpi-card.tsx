import { Card } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  gradient: string;
  trend?: "up" | "down" | "flat" | null;
  prefix?: string;
  alert?: boolean;
}

const trendMap = {
  up: { symbol: "↑", className: "text-emerald-400" },
  down: { symbol: "↓", className: "text-rose-300" },
  flat: { symbol: "→", className: "text-zinc-300" }
} as const;

export function KpiCard({
  title,
  value,
  subtitle,
  gradient,
  trend = null,
  prefix,
  alert
}: KpiCardProps) {
  const trendDisplay = trend ? trendMap[trend] : null;

  return (
    <Card className={`relative overflow-hidden border border-white/20 p-5 shadow-md sm:p-6 ${alert ? "border-amber-200" : ""}`}>
      <div
        className="absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-[0.14]"
        style={{ background: gradient }}
      />
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </span>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-3xl font-extrabold tracking-tight text-zinc-950">
          {prefix ?? ""}
          {value}
        </div>
        {trendDisplay ? (
          <span className={`pb-1 text-lg font-semibold ${trendDisplay.className}`}>
            {trendDisplay.symbol}
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="mt-2.5 text-sm font-medium text-zinc-600">{subtitle}</p> : null}
    </Card>
  );
}
