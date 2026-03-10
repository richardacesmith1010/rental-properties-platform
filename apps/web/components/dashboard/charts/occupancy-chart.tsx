"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OccupancyMetric } from "@/lib/analytics";

interface OccupancyChartProps {
  metrics: OccupancyMetric[];
}

export function OccupancyChart({ metrics }: OccupancyChartProps) {
  if (metrics.length === 0) {
    return <div className="flex h-[250px] items-center justify-center text-sm text-zinc-500">No occupancy trend yet.</div>;
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={metrics} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#71717a", fontSize: 12 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) {
                return null;
              }

              const metric = payload[0]?.payload as OccupancyMetric;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg">
                  <p className="font-medium text-zinc-900">{label}</p>
                  <p className="text-zinc-600">
                    {metric.occupiedUnits} of {metric.totalUnits} units ({metric.rate.toFixed(0)}%)
                  </p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="rate" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
