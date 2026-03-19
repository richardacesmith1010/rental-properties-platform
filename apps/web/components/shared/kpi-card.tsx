import { Card } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  gradient: string;
  trend?: "up" | "down" | "flat" | null;
  prefix?: string;
  alert?: boolean;
  ariaLabel?: string;
}

const trendMap = {
  up: { symbol: "↑", className: "text-emerald-400" },
  down: { symbol: "↓", className: "text-rose-300" },
  flat: { symbol: "→", className: "text-muted-foreground" }
} as const;

export function KpiCard({
  title,
  value,
  subtitle,
  gradient,
  trend = null,
  prefix,
  alert,
  ariaLabel
}: KpiCardProps) {
  const trendDisplay = trend ? trendMap[trend] : null;
  const cardAriaLabel = ariaLabel ?? `${title}: ${prefix ?? ""}${value}${subtitle ? `. ${subtitle}` : ""}`;

  return (
    <Card
      role="status"
      aria-label={cardAriaLabel}
      className={`relative min-h-[44px] overflow-hidden border border-border/50 p-5 shadow-md sm:p-6 ${alert ? "border-amber-200" : ""}`}
    >
      <div
        className="absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-[0.14]"
        style={{ background: gradient }}
      />
      <span aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <div className="mt-2 flex items-end gap-2">
        <div aria-live="polite" aria-atomic="true" className="text-3xl font-extrabold tracking-tight text-foreground">
          {prefix ?? ""}
          {value}
        </div>
        {trendDisplay ? (
          <span aria-hidden="true" className={`pb-1 text-lg font-semibold ${trendDisplay.className}`}>
            {trendDisplay.symbol}
          </span>
        ) : null}
      </div>
      {subtitle ? <p aria-hidden="true" className="mt-2.5 text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
    </Card>
  );
}
