"use client";

import { ArrowRight, BarChart3, Plus, UserPlus } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { ContextualGreeting } from "@/components/dashboard/contextual-greeting";
import { Button } from "@/components/ui/button";

interface OwnerDailyOpsHomeProps {
  userName: string;
  overdueChargeCount: number;
  overdueAmountCents: number;
  openTicketCount: number;
  onOpenOverview: () => void;
  onOpenPropertyWizard: () => void;
  onOpenTenantInviteWizard: () => void;
  onOpenReports: () => void;
}

export function OwnerDailyOpsHome({
  userName,
  overdueChargeCount,
  overdueAmountCents,
  openTicketCount,
  onOpenOverview,
  onOpenPropertyWizard,
  onOpenTenantInviteWizard,
  onOpenReports
}: OwnerDailyOpsHomeProps) {
  return (
    <div className="flex min-h-full items-center justify-center py-6">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 rounded-[32px] border border-border/60 bg-card/75 px-8 py-10 text-center shadow-sm">
        <div className="space-y-2">
          <ContextualGreeting
            userName={userName}
            overdueChargeCount={overdueChargeCount}
            overdueAmountCents={overdueAmountCents}
            openTicketCount={openTicketCount}
          />
        </div>
        <DomMascot size="xl" mood="waving" animate />
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">Use the arrows to explore your dashboard</h3>
          <p className="text-sm text-muted-foreground">
            Start with Overview for portfolio health, then move through charges, maintenance,
            leases, manager payments, and analytics one page at a time.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={onOpenPropertyWizard} title="Open the property creation wizard.">
            <Plus className="mr-2 h-4 w-4" />
            New Property
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenTenantInviteWizard}
            title="Open the tenant invitation wizard."
          >
            <UserPlus className="mr-2 h-4 w-4" />
            New Tenant
          </Button>
          <Button type="button" variant="outline" onClick={onOpenReports} title="Open financial reports.">
            <BarChart3 className="mr-2 h-4 w-4" />
            Reports
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
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
