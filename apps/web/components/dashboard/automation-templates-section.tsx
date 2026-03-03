"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/shared/empty-state";
import type { ActionState } from "@/app/actions";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface AutomationTemplatesSectionProps {
  role: "owner" | "manager";
  templates: AutomationTemplateDTO[];
  rules: AutomationRuleDTO[];
  properties: Array<{ id: string; name: string }>;
  runtimeReady?: boolean;
  runtimeWarning?: string | null;
  onOpenSection?: (sectionId: string) => void;
  onEnableAutomation?: StatefulAction;
  onDisableAutomation?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Automation toggles are unavailable right now."
});

function triggerLabel(key: string) {
  if (key === "late_rent_sequence") return "Charge becomes late";
  if (key === "lease_renewal_sequence") return "Lease nears expiration";
  if (key === "new_ticket_sla") return "New maintenance ticket is opened";
  if (key === "move_in_sequence") return "Lease becomes active";
  if (key === "move_out_sequence") return "Lease termination starts";
  if (key === "manager_vendor_followup") return "Vendor response exceeds SLA";
  return "Workflow trigger";
}

function targetSectionForTemplate(key: string) {
  if (key === "late_rent_sequence") return "charges";
  if (key === "lease_renewal_sequence") return "documents";
  if (key === "new_ticket_sla") return "maintenance";
  if (key === "move_in_sequence") return "leasing";
  if (key === "move_out_sequence") return "leases";
  if (key === "manager_vendor_followup") return "vendors";
  return "overview";
}

function AutomationToggleRow({
  template,
  propertyId,
  enabled,
  runtimeReady,
  onEnableAutomation,
  onDisableAutomation,
  onOpenSection
}: {
  template: AutomationTemplateDTO;
  propertyId: string;
  enabled: boolean;
  runtimeReady: boolean;
  onEnableAutomation?: StatefulAction;
  onDisableAutomation?: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
}) {
  const action = enabled ? onDisableAutomation ?? unavailableAction : onEnableAutomation ?? unavailableAction;
  const [state, formAction] = useFormState(action, null);
  const targetSection = targetSectionForTemplate(template.key);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">{template.name}</p>
        <Badge variant={enabled ? "success" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        <span className="font-semibold">Trigger:</span> {triggerLabel(template.key)}
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        <span className="font-semibold">Actions:</span> {template.description ?? "Execute configured flow actions."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="templateId" value={template.id} />
          <SubmitButton
            size="sm"
            variant={enabled ? "outline" : "default"}
            disabled={!runtimeReady}
            title={enabled ? "Disable this automation template for this property." : "Enable this automation template for this property."}
          >
            {enabled ? "Disable" : "Enable"}
          </SubmitButton>
        </form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          title={`Open ${targetSection} section for this workflow.`}
          onClick={() => onOpenSection?.(targetSection)}
        >
          Open workflow context
        </Button>
      </div>
      {state && !state.success && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
    </div>
  );
}

export function AutomationTemplatesSection({
  role,
  templates,
  rules,
  properties,
  runtimeReady = true,
  runtimeWarning = null,
  onOpenSection,
  onEnableAutomation,
  onDisableAutomation
}: AutomationTemplatesSectionProps) {
  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) =>
        role === "owner"
          ? template.roleScope === "owner" || template.roleScope === "both"
          : template.roleScope === "manager" || template.roleScope === "both"
      ),
    [role, templates]
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(properties[0]?.id ?? "");

  useEffect(() => {
    if (properties.length === 0) {
      setSelectedPropertyId("");
      return;
    }

    if (!selectedPropertyId || !properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const activeTemplateIds = useMemo(() => {
    if (!selectedPropertyId) {
      return new Set<string>();
    }

    return new Set(
      rules
        .filter((rule) => rule.propertyId === selectedPropertyId && rule.active)
        .map((rule) => rule.templateId)
    );
  }, [rules, selectedPropertyId]);

  const enabledCount = filteredTemplates.filter((template) => activeTemplateIds.has(template.id)).length;

  return (
    <Card id="automations">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Domus Flows</CardTitle>
        <Badge variant={enabledCount > 0 ? "success" : "outline"}>{enabledCount} enabled</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">
          Automation templates are now persisted per property. Toggle each workflow to create or update a live automation rule.
        </p>
        {!runtimeReady && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {runtimeWarning ?? "Server-side automation runtime is not live yet."}
          </div>
        )}

        {properties.length === 0 ? (
          <EmptyState message="No properties are available yet. Create a property to configure automation rules." />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Property scope</p>
              <Select
                value={selectedPropertyId}
                onChange={(event) => setSelectedPropertyId(event.target.value)}
                title="Choose which property these automations apply to."
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </div>

            {filteredTemplates.length === 0 ? (
              <EmptyState message="No automation templates are available for this role." />
            ) : (
              filteredTemplates.map((template) => (
                <AutomationToggleRow
                  key={template.id}
                  template={template}
                  propertyId={selectedPropertyId}
                  enabled={activeTemplateIds.has(template.id)}
                  runtimeReady={runtimeReady}
                  onEnableAutomation={onEnableAutomation}
                  onDisableAutomation={onDisableAutomation}
                  onOpenSection={onOpenSection}
                />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
