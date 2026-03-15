"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DistributionHistoryEntry } from "@/lib/distributions";

interface DistributionHistoryProps {
  entries: DistributionHistoryEntry[];
}

function getStatusVariant(status: DistributionHistoryEntry["status"]) {
  if (status === "completed") {
    return "success" as const;
  }
  if (status === "failed") {
    return "destructive" as const;
  }
  return "warning" as const;
}

export function DistributionHistory({ entries }: DistributionHistoryProps) {
  const visibleEntries = entries.slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribution History</CardTitle>
      </CardHeader>
      <CardContent>
        {visibleEntries.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No distributions yet"
            description="Completed member payout splits will appear here."
          />
        ) : (
          <div>
            {visibleEntries.map((entry, index) => (
              <DataRow key={entry.id} last={index === visibleEntries.length - 1}>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{entry.memberName}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDate(entry.createdAt)} • {entry.memberEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatCurrency(entry.amountCents)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {entry.distributionPct !== null ? `${entry.distributionPct.toFixed(2)}%` : "Retained"}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(entry.status)} className="capitalize">
                    {entry.status}
                  </Badge>
                </div>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
