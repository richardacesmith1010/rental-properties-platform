import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { formatDateTime } from "@/lib/format";

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  userName: string;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getMetadataString(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function getAuditPropertyIds(
  metadata: Record<string, unknown>,
  entityType: string,
  entityId: string | null
): string[] {
  const ids = new Set<string>();
  const directKeys = ["propertyId", "property_id"];

  for (const key of directKeys) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      ids.add(value);
    }
  }

  for (const key of ["propertyIds", "property_ids"]) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.length > 0) {
          ids.add(entry);
        }
      }
    }
  }

  if (entityType === "property" && entityId) {
    ids.add(entityId);
  }

  return Array.from(ids);
}

export function formatAuditAction(
  action: string,
  entityType: string,
  metadata: Record<string, unknown> = {}
) {
  const propertyName = getMetadataString(metadata, "propertyName", "property_name");
  const unitNumber = getMetadataString(metadata, "unitNumber", "unit_number");
  const tenantName = getMetadataString(metadata, "tenantName", "tenant_name", "tenantEmail", "tenant_email");
  const vendorName = getMetadataString(metadata, "vendorName", "vendor_name");

  switch (action) {
    case "create_property":
      return `Created property${propertyName ? ` ${propertyName}` : ""}`;
    case "update_property":
      return `Updated property${propertyName ? ` ${propertyName}` : ""}`;
    case "delete_property":
      return `Archived property${propertyName ? ` ${propertyName}` : ""}`;
    case "create_unit":
      return `Created unit${unitNumber ? ` ${unitNumber}` : ""}`;
    case "update_unit":
      return `Updated unit${unitNumber ? ` ${unitNumber}` : ""}`;
    case "delete_unit":
      return `Archived unit${unitNumber ? ` ${unitNumber}` : ""}`;
    case "create_lease":
      return `Created lease${tenantName ? ` for ${tenantName}` : ""}${unitNumber ? ` in Unit ${unitNumber}` : ""}`;
    case "update_lease":
      return `Updated lease${tenantName ? ` for ${tenantName}` : ""}`;
    case "renew_lease":
      return `Renewed lease${tenantName ? ` for ${tenantName}` : ""}`;
    case "terminate_lease":
      return `Terminated lease${tenantName ? ` for ${tenantName}` : ""}`;
    case "delete_lease":
      return `Archived lease${tenantName ? ` for ${tenantName}` : ""}`;
    case "record_payment":
      return `Recorded payment${unitNumber ? ` for Unit ${unitNumber}` : ""}`;
    case "create_ticket":
      return `Created maintenance ticket${propertyName ? ` at ${propertyName}` : ""}`;
    case "update_ticket_status":
      return `Updated maintenance ticket status${propertyName ? ` at ${propertyName}` : ""}`;
    case "add_ticket_comment":
      return `Added maintenance comment${propertyName ? ` at ${propertyName}` : ""}`;
    case "invite_tenant":
      return `Invited tenant${tenantName ? ` ${tenantName}` : ""}`;
    case "invite_manager":
      return `Invited manager${tenantName ? ` ${tenantName}` : ""}`;
    case "invite_owner":
      return `Invited owner${tenantName ? ` ${tenantName}` : ""}`;
    case "create_expense":
      return `Created expense${propertyName ? ` for ${propertyName}` : ""}`;
    case "update_expense":
      return `Updated expense${propertyName ? ` for ${propertyName}` : ""}`;
    case "delete_expense":
      return `Deleted expense${propertyName ? ` for ${propertyName}` : ""}`;
    case "create_vendor":
      return `Created vendor${vendorName ? ` ${vendorName}` : ""}`;
    case "assign_vendor":
      return `Assigned vendor${vendorName ? ` ${vendorName}` : ""}`;
    case "update_management_fee":
      return `Updated management fee${propertyName ? ` for ${propertyName}` : ""}`;
    default: {
      const readableAction = action.replace(/_/g, " ");
      const readableEntity = entityType.replace(/_/g, " ");
      return `${readableAction} ${readableEntity}`.trim();
    }
  }
}

export async function logAudit(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {}
    });

    if (error) {
      console.error("Failed to write audit log:", error);
    }
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

export async function getRecentAuditLogs(userId: string, limit = 50): Promise<AuditLogEntry[]> {
  try {
    const admin = createAdminClient();
    const propertyIds = await getAdministeredPropertyIds(userId);

    const { data: logs, error } = await admin
      .from("audit_logs")
      .select("id, user_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 100));

    if (error) {
      console.error("Failed to load audit logs:", error);
      return [];
    }

    const filteredLogs = (logs ?? []).filter((row) => {
      const metadata = normalizeMetadata(row.metadata);
      const relatedPropertyIds = getAuditPropertyIds(metadata, row.entity_type, row.entity_id);
      return row.user_id === userId || relatedPropertyIds.some((propertyId) => propertyIds.includes(propertyId));
    });

    if (filteredLogs.length === 0) {
      return [];
    }

    const actorIds = Array.from(new Set(filteredLogs.map((row) => row.user_id).filter(Boolean)));
    const { data: profiles, error: profilesError } = actorIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", actorIds)
      : { data: [], error: null };

    if (profilesError) {
      console.error("Failed to load audit actors:", profilesError);
    }

    const profileById = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        profile.full_name?.trim() || profile.email || "Domus User"
      ])
    );

    return filteredLogs.slice(0, limit).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: normalizeMetadata(row.metadata),
      createdAt: row.created_at,
      userName: profileById.get(row.user_id) ?? "Domus User"
    }));
  } catch (error) {
    console.error("Failed to load audit logs:", error);
    return [];
  }
}

export function formatAuditTimestamp(value: string) {
  return formatDateTime(value);
}
