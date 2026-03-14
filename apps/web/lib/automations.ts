import { createClient } from "@/lib/supabase/server";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface AutomationTemplateDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  roleScope: "owner" | "manager" | "both";
  enabledByDefault: boolean;
}

export interface AutomationRuleDTO {
  id: string;
  propertyId: string;
  templateId: string;
  active: boolean;
  config: Record<string, unknown> | null;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
}

export async function getAutomationTemplates(): Promise<AutomationTemplateDTO[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("automation_templates")
    .select("id, key, name, description, role_scope, enabled_by_default")
    .order("name", { ascending: true });

  if (error && isMissingSchemaError(error)) {
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    roleScope: row.role_scope as "owner" | "manager" | "both",
    enabledByDefault: row.enabled_by_default ?? false
  }));
}

export async function getAutomationRulesForUser(userId: string): Promise<AutomationRuleDTO[]> {
  const supabase = createClient();
  const propertyIds = await getAdministeredPropertyIds(userId);
  if (propertyIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("automation_rules")
    .select("id, property_id, template_id, active, config, created_by_profile_id, created_at, updated_at")
    .in("property_id", propertyIds)
    .order("updated_at", { ascending: false });

  if (error && isMissingSchemaError(error)) {
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    templateId: row.template_id,
    active: row.active,
    config: row.config as Record<string, unknown> | null,
    createdByProfileId: row.created_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}
