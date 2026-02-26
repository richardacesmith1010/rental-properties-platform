import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KpiCardProps {
  label: string;
  value: string;
  badge: string;
  gradient: string;
  alert?: boolean;
}

export function KpiCard({ label, value, badge, gradient, alert }: KpiCardProps) {
  return (
    <Card className={`relative overflow-hidden p-5 ${alert ? "border-amber-200" : ""}`}>
      <div
        className="absolute -top-5 -right-5 h-20 w-20 rounded-full opacity-[0.08]"
        style={{ background: gradient }}
      />
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900">
        {value}
      </div>
      <div className="mt-2.5">
        <Badge variant={alert ? "warning" : "default"}>{badge}</Badge>
      </div>
    </Card>
  );
}
