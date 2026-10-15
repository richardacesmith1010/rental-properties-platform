"use client";

import dynamic from "next/dynamic";

export const AnalyticsSection = dynamic(
  () => import("../analytics-section").then((module) => module.AnalyticsSection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        Loading analytics...
      </div>
    )
  }
);
