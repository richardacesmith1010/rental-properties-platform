"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MaintenanceMetric } from "@/lib/analytics";

interface MaintenanceChartProps {
  metrics: MaintenanceMetric[];
}

function labelForPriority(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function MaintenanceChart({ metrics }: MaintenanceChartProps) {
  if (metrics.length === 0) {
    return <div className="flex h-[250px] items-center justify-center text-sm text-zinc-500">No maintenance activity yet.</div>;
  }

  const chartData = metrics.map((metric) => ({
    priority: labelForPriority(metric.priority),
    resolved: metric.resolvedTickets,
    unresolved: Math.max(metric.totalTickets - metric.resolvedTickets, 0),
    avgResolutionLabel: metric.resolvedTickets > 0 ? `${metric.avgResolutionDays.toFixed(1)}d avg` : ""
  }));

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--domus-divider)" strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fill: "var(--domus-muted-text)", fontSize: 12 }} />
          <YAxis type="category" dataKey="priority" tick={{ fill: "var(--domus-muted-text)", fontSize: 12 }} width={60} />
          <Tooltip
            contentStyle={{
              background: "var(--domus-card-bg)",
              border: "1px solid var(--domus-card-border)",
              color: "var(--domus-heading-text)",
              borderRadius: "16px",
              boxShadow: "var(--domus-shadow-md)"
            }}
            labelStyle={{ color: "var(--domus-heading-text)" }}
            formatter={(value, name) => [Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0), name]}
          />
          <Bar dataKey="resolved" stackId="tickets" fill="#059669" name="Resolved" radius={[0, 4, 4, 0]} />
          <Bar dataKey="unresolved" stackId="tickets" fill="#71717a" name="Unresolved" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="avgResolutionLabel" position="right" fill="var(--domus-muted-text)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
