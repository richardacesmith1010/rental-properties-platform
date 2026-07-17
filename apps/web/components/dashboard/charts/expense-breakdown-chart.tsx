"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ExpenseCategoryMetric } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";

interface ExpenseBreakdownChartProps {
  categories: ExpenseCategoryMetric[];
}

const COLORS = [
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 82%, var(--surface))",
  "color-mix(in srgb, var(--accent) 66%, var(--surface))",
  "color-mix(in srgb, var(--accent) 52%, var(--surface))",
  "color-mix(in srgb, var(--accent) 40%, var(--surface))",
  "color-mix(in srgb, var(--accent) 30%, var(--surface-2))"
];

function formatCategory(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toNumber(
  value: string | number | Array<string | number> | ReadonlyArray<string | number> | undefined
) {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }
  return Number(value ?? 0);
}

export function ExpenseBreakdownChart({ categories }: ExpenseBreakdownChartProps) {
  if (categories.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">No expense data yet.</div>;
  }

  const total = categories.reduce((sum, category) => sum + category.totalCents, 0);
  const chartData = categories.map((category) => ({
    name: formatCategory(category.category),
    value: category.totalCents / 100
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={96}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--domus-card-bg)",
              border: "1px solid var(--domus-card-border)",
              color: "var(--domus-heading-text)",
              borderRadius: "16px",
              boxShadow: "var(--domus-shadow-md)"
            }}
            labelStyle={{ color: "var(--domus-heading-text)" }}
            formatter={(value) => formatCurrency(Math.round(toNumber(value) * 100))}
          />
          <Legend wrapperStyle={{ color: "var(--domus-muted-text)", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-2 text-center text-xs font-medium text-[var(--muted)]">
        Total: {formatCurrency(total)}
      </p>
    </div>
  );
}
