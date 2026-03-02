"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

interface AutomationTemplatesSectionProps {
  role: "owner" | "manager";
  userKey: string;
  runtimeReady?: boolean;
  runtimeWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
}

interface AutomationTemplate {
  id: string;
  name: string;
  trigger: string;
  actions: string;
  targetSection: string;
}

const ownerTemplates: AutomationTemplate[] = [
  {
    id: "late_rent_sequence",
    name: "Late Rent Sequence",
    trigger: "Charge becomes late",
    actions: "Create inbox alert, email tenant, and queue follow-up reminder.",
    targetSection: "charges"
  },
  {
    id: "lease_renewal_sequence",
    name: "Lease Renewal Sequence",
    trigger: "60/30/14 days before lease end",
    actions: "Create renewal task, notify tenant, and create draft document packet.",
    targetSection: "documents"
  },
  {
    id: "new_ticket_sla",
    name: "Maintenance SLA Sequence",
    trigger: "New maintenance ticket created",
    actions: "Notify owner/manager, set SLA checkpoint, and escalate if unresolved.",
    targetSection: "maintenance"
  },
  {
    id: "move_in_sequence",
    name: "Move-in Sequence",
    trigger: "Lease becomes active",
    actions: "Generate first charge, send onboarding checklist, and confirm packet status.",
    targetSection: "leasing"
  },
  {
    id: "move_out_sequence",
    name: "Move-out Sequence",
    trigger: "Lease termination initiated",
    actions: "Create inspection checklist, reminder tasks, and closeout document packet.",
    targetSection: "leases"
  }
];

const managerTemplates: AutomationTemplate[] = [
  {
    id: "manager_ticket_sla",
    name: "Maintenance SLA Sequence",
    trigger: "New maintenance ticket created",
    actions: "Notify manager inbox, assign vendor path, and escalate if unresolved.",
    targetSection: "maintenance"
  },
  {
    id: "manager_move_in_sequence",
    name: "Move-in Sequence",
    trigger: "Lease becomes active",
    actions: "Confirm tenant onboarding, first charge visibility, and document status.",
    targetSection: "leasing"
  },
  {
    id: "manager_vendor_followup",
    name: "Vendor Follow-up Sequence",
    trigger: "Ticket in_progress for 48+ hours",
    actions: "Create manager reminder and queue follow-up communication.",
    targetSection: "vendors"
  }
];

function storageKey(role: "owner" | "manager", userKey: string) {
  return `domus_flow_templates_${role}_${userKey}_v1`;
}

export function AutomationTemplatesSection({
  role,
  userKey,
  runtimeReady = true,
  runtimeWarning = null,
  onOpenSection
}: AutomationTemplatesSectionProps) {
  const templates = useMemo(() => (role === "owner" ? ownerTemplates : managerTemplates), [role]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(role, userKey));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setEnabledMap(parsed);
    } catch {
      setEnabledMap({});
    }
  }, [role, userKey]);

  const toggleTemplate = (id: string) => {
    setEnabledMap((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(storageKey(role, userKey), JSON.stringify(next));
      return next;
    });
  };

  const enabledCount = templates.filter((template) => enabledMap[template.id]).length;

  return (
    <Card id="automations">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Domus Flows</CardTitle>
        <Badge variant={enabledCount > 0 ? "success" : "outline"}>
          {enabledCount} enabled
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">
          Automation templates for repeatable operations. Current toggles are local to this browser until server-side flow execution is connected.
        </p>
        {!runtimeReady && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {runtimeWarning ??
              "Server-side automation runtime is not live yet. Template toggles remain local to this browser."}
          </div>
        )}

        {templates.length === 0 ? (
          <EmptyState message="No automation templates available for this role yet." />
        ) : (
          <div className="space-y-3">
            {templates.map((template) => {
              const enabled = Boolean(enabledMap[template.id]);

              return (
                <div key={template.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-900">{template.name}</p>
                    <Badge variant={enabled ? "success" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">
                    <span className="font-semibold">Trigger:</span> {template.trigger}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    <span className="font-semibold">Actions:</span> {template.actions}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={enabled ? "outline" : "default"}
                      title={enabled ? "Disable this automation template." : "Enable this automation template."}
                      onClick={() => toggleTemplate(template.id)}
                    >
                      {enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title={`Open ${template.targetSection} section for this workflow.`}
                      onClick={() => onOpenSection?.(template.targetSection)}
                    >
                      Open workflow context
                    </Button>
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
