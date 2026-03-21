"use client";

import { ArrowRight } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";

interface OwnerDailyOpsHomeProps {
  onOpenOverview: () => void;
}

export function OwnerDailyOpsHome({ onOpenOverview }: OwnerDailyOpsHomeProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="flex max-w-xl flex-col items-center gap-5 rounded-[28px] border border-dashed border-border/70 bg-card/70 px-8 py-10 text-center shadow-sm">
        <DomMascot size="xl" mood="waving" animate />
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">Use the arrows to explore your dashboard</h3>
          <p className="text-sm text-muted-foreground">
            Start with your portfolio snapshot, then move through charges, maintenance, leases,
            manager payments, and analytics one page at a time.
          </p>
        </div>
        <Button
          type="button"
          onClick={onOpenOverview}
          className="inline-flex items-center gap-2"
          title="Open the overview page."
        >
          Open Overview
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
