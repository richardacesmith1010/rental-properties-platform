"use client";

import { Activity, Building2, CreditCard, Receipt, UserPlus, Wrench } from "lucide-react";
import type { AuditLogEntry } from "@/lib/audit";
import { formatAuditAction, formatAuditTimestamp } from "@/lib/audit";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ActivityFeedProps {
  logs: AuditLogEntry[];
  limit?: number;
}

function iconForEntity(entityType: string) {
  switch (entityType) {
    case "property":
    case "unit":
      return Building2;
    case "payment":
    case "charge":
    case "expense":
      return CreditCard;
    case "lease":
      return Receipt;
    case "maintenance_ticket":
      return Wrench;
    case "invitation":
      return UserPlus;
    default:
      return Activity;
  }
}

export function ActivityFeed({ logs, limit = 20 }: ActivityFeedProps) {
  const visibleLogs = logs.slice(0, limit);

  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visibleLogs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity"
            description="Operational changes will appear here as your team works across the portfolio."
          />
        ) : (
          <div className="space-y-3">
            {visibleLogs.map((log) => {
              const Icon = iconForEntity(log.entityType);
              return (
                <div key={log.id} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="rounded-lg bg-[var(--surface)] p-2 text-[var(--accent)] shadow-[var(--domus-shadow-sm)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {formatAuditAction(log.action, log.entityType, log.metadata)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {log.userName} · {formatAuditTimestamp(log.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
