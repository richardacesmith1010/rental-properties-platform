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
    return <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">No rent history yet.</div>;
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
          <CartesianGrid stroke="var(--domus-divider)" strokeDasharray="3 3" vertical={false} />
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
          <Bar
            dataKey="collected"
            stackId="rent"
            fill="color-mix(in srgb, var(--accent) 82%, var(--surface))"
            radius={[4, 4, 0, 0]}
            name="Collected"
          />
          <Bar
            dataKey="late"
            stackId="rent"
            fill="color-mix(in srgb, var(--accent) 28%, var(--surface-3))"
            radius={[4, 4, 0, 0]}
            name="Late"
          />
          <Line
            type="monotone"
            dataKey="due"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 0 }}
            activeDot={{ r: 0 }}
            name="Due"
          />
          <Line
            type="monotone"
            dataKey="due"
            stroke="transparent"
            dot={(props) =>
              props.index === chartData.length - 1 ? (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ) : (
                <></>
              )
            }
            activeDot={false}
            name=""
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
