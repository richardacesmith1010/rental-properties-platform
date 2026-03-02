"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InvitationListItem } from "@/lib/invitations";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { PortfolioData } from "@/lib/portfolio";

interface LeasingHubSectionProps {
  portfolio: PortfolioData;
  invitations: InvitationListItem[];
  documents: OwnerDocumentsData;
  chargeCount: number;
  pipelineReady?: boolean;
  pipelineWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
}

interface LeasingStage {
  id: string;
  label: string;
  description: string;
  done: boolean;
  metric: string;
  targetSection: string;
  actionLabel: string;
}

function buildLeasingStages(params: {
  portfolio: PortfolioData;
  invitations: InvitationListItem[];
  documents: OwnerDocumentsData;
  chargeCount: number;
}): LeasingStage[] {
  const tenantInvites = params.invitations.filter((invite) => invite.role === "tenant");
  const pendingTenantInvites = tenantInvites.filter((invite) => invite.status === "pending");
  const activeLeases = params.portfolio.leases.filter((lease) => lease.active);
  const sentOrSignedPackets = params.documents.packets.filter(
    (packet) => packet.status === "sent" || packet.status === "signed"
  );

  return [
    {
      id: "properties_ready",
      label: "Property + Unit Ready",
      description: "Set up at least one active property and unit before inviting tenants.",
      done: params.portfolio.properties.length > 0 && params.portfolio.units.length > 0,
      metric: `${params.portfolio.properties.length} properties / ${params.portfolio.units.length} units`,
      targetSection: "operations",
      actionLabel: "Set up property"
    },
    {
      id: "tenant_invited",
      label: "Tenant Invited",
      description: "Invite the tenant who will apply/sign for the lease.",
      done: tenantInvites.length > 0,
      metric: `${tenantInvites.length} invites (${pendingTenantInvites.length} pending)`,
      targetSection: "invitations",
      actionLabel: "Invite tenant"
    },
    {
      id: "lease_created",
      label: "Lease Created",
      description: "Create and activate the lease terms for the selected unit.",
      done: activeLeases.length > 0,
      metric: `${activeLeases.length} active leases`,
      targetSection: "leases",
      actionLabel: "Create lease"
    },
    {
      id: "docs_sent",
      label: "Docs Sent for Signature",
      description: "Send lease packet(s) and confirm signature workflow is in motion.",
      done: sentOrSignedPackets.length > 0,
      metric: `${sentOrSignedPackets.length} packets sent/signed`,
      targetSection: "documents",
      actionLabel: "Send documents"
    },
    {
      id: "billing_live",
      label: "Billing Live",
      description: "Verify first rent charge appears so payment collection can begin.",
      done: params.chargeCount > 0,
      metric: `${params.chargeCount} open charges`,
      targetSection: "charges",
      actionLabel: "Review charges"
    }
  ];
}

function currentStepLabel(stages: LeasingStage[]) {
  const pending = stages.find((stage) => !stage.done);
  if (!pending) {
    return "Leasing workflow complete for current portfolio.";
  }
  return `Next best action: ${pending.label}`;
}

export function LeasingHubSection({
  portfolio,
  invitations,
  documents,
  chargeCount,
  pipelineReady = true,
  pipelineWarning = null,
  onOpenSection
}: LeasingHubSectionProps) {
  const stages = buildLeasingStages({
    portfolio,
    invitations,
    documents,
    chargeCount
  });

  return (
    <div id="leasing" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Leasing Hub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-600">
            Use this workflow to move from empty unit to signed lease and active billing with minimal context switching.
          </p>
          {!pipelineReady && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {pipelineWarning ?? "Pipeline persistence is not live yet. Workflow progress uses currently available records only."}
            </div>
          )}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
            {currentStepLabel(stages)}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {stages.map((stage) => (
          <Card key={stage.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">{stage.label}</p>
                <Badge variant={stage.done ? "success" : "outline"}>{stage.done ? "Done" : "Pending"}</Badge>
              </div>
              <p className="text-xs text-zinc-600">{stage.description}</p>
              <p className="text-xs font-medium text-zinc-700">{stage.metric}</p>
              <Button
                type="button"
                size="sm"
                variant={stage.done ? "outline" : "default"}
                title={`Go to ${stage.targetSection} to continue this leasing step.`}
                onClick={() => onOpenSection?.(stage.targetSection)}
              >
                {stage.actionLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
