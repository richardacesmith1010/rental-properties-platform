"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MonthlyRentMetric } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";

interface RentCollectionChartProps {
  metrics: MonthlyRentMetric[];
}

function formatDollars(value: number) {
  return formatCurrency(Math.round(value * 100));
}

function toNumber(
  value: string | number | Array<string | number> | ReadonlyArray<string | number> | undefined
) {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }
  return Number(value ?? 0);
}

export function RentCollectionChart({ metrics }: RentCollectionChartProps) {
  if (metrics.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-zinc-500">No rent history yet.</div>;
  }

  const chartData = metrics.map((metric) => ({
    month: metric.month,
    collected: metric.collectedCents / 100,
    late: metric.lateCents / 100,
    due: metric.dueCents / 100
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--domus-divider)" strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fill: "var(--domus-muted-text)", fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "var(--domus-muted-text)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: "var(--domus-card-bg)",
              border: "1px solid var(--domus-card-border)",
              color: "var(--domus-heading-text)",
              borderRadius: "16px",
              boxShadow: "var(--domus-shadow-md)"
            }}
            labelStyle={{ color: "var(--domus-heading-text)" }}
            formatter={(value, name) => [formatDollars(toNumber(value)), name]}
            labelFormatter={(label) => `Month: ${label}`}
          />
          <Bar dataKey="collected" stackId="rent" fill="#059669" radius={[4, 4, 0, 0]} name="Collected" />
          <Bar dataKey="late" stackId="rent" fill="#e11d48" radius={[4, 4, 0, 0]} name="Late" />
          <Line
            type="monotone"
            dataKey="due"
            stroke="#7c3aed"
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Due"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
