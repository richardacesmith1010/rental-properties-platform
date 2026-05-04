import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const CHARGE_CATEGORY_VALUES = [
  "rent",
  "late_fee",
  "utility",
  "maintenance",
  "deposit",
  "key_replacement",
  "other"
] as const;

export const CHARGE_STATUS_VALUES = ["pending", "paid", "late", "waived"] as const;

export type ChargeCategory = (typeof CHARGE_CATEGORY_VALUES)[number];
export type ChargeStatus = (typeof CHARGE_STATUS_VALUES)[number];

export interface ChargeEditHistoryEntryDTO {
  id: string;
  chargeId: string;
  editedBy: string;
  editedByName: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ChargeDetailRecordDTO {
  id: string;
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  tenantProfileId: string | null;
  tenantName: string;
  tenantEmail: string;
  dueDate: string;
  amountCents: number;
  status: ChargeStatus;
  category: ChargeCategory;
  notes: string | null;
  latestEditedAt: string | null;
  latestEditedByName: string | null;
  editedCount: number;
}

export interface ExpenseLineItemDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  category: string;
  description: string | null;
  amountCents: number;
  expenseDate: string;
}

export interface ChargeAuditSummary {
  latestEditedAt: string | null;
  latestEditedByName: string | null;
  editedCount: number;
}

export function normalizeChargeCategory(
  value: string | null | undefined
): ChargeCategory {
  switch (value) {
    case "late_fee":
    case "utility":
    case "maintenance":
    case "deposit":
    case "key_replacement":
    case "other":
      return value;
    case "rent":
    default:
      return "rent";
  }
}

export function chargeCategoryLabel(category: ChargeCategory | string | null | undefined) {
  switch (category) {
    case "rent":
      return "Rent";
    case "late_fee":
      return "Late Fee";
    case "utility":
      return "Utility";
    case "maintenance":
      return "Maintenance";
    case "deposit":
      return "Deposit";
    case "key_replacement":
      return "Key Replacement";
    case "other":
    default:
      return "Other";
  }
}

export function isChargeEditableStatus(status: ChargeStatus | string | null | undefined) {
  return status === "pending" || status === "late";
}

export function isChargeOutstanding(status: ChargeStatus | string | null | undefined) {
  return status === "pending" || status === "late";
}

export function getChargeAuditSummary(history: ChargeEditHistoryEntryDTO[]): ChargeAuditSummary {
  if (history.length === 0) {
    return {
      latestEditedAt: null,
      latestEditedByName: null,
      editedCount: 0
    };
  }

  const latest = [...history].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  return {
    latestEditedAt: latest.createdAt,
    latestEditedByName: latest.editedByName,
    editedCount: history.length
  };
}

export async function withChargeEditingFallback<T extends { error: unknown }>(
  primary: () => PromiseLike<T>,
  fallback: () => PromiseLike<T>
): Promise<T> {
  const result = await primary();
  if (result.error && isMissingSchemaError(result.error)) {
    return fallback();
  }
  return result;
}

export async function getChargeEditHistoryMap(
  supabase: SupabaseClient,
  chargeIds: string[]
): Promise<Map<string, ChargeEditHistoryEntryDTO[]>> {
  if (chargeIds.length === 0) {
    return new Map();
  }

  const { data: historyRows, error } = await supabase
    .from("charge_edit_history")
    .select("id, charge_id, edited_by, field_name, old_value, new_value, reason, created_at")
    .in("charge_id", chargeIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaError(error)) {
      return new Map();
    }
    throw error;
  }

  const editorIds = Array.from(
    new Set(
      (historyRows ?? [])
        .map((row) => row.edited_by)
        .filter((value): value is string => Boolean(value))
    )
  );

  const { data: editors, error: editorError } = editorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", editorIds)
    : {
        data: [] as Array<{ id: string; full_name: string | null; email: string | null }>,
        error: null
      };

  if (editorError) {
    if (!isMissingSchemaError(editorError)) {
      throw editorError;
    }
  }

  const editorNameById = new Map(
    (editors ?? []).map((editor) => [editor.id, editor.full_name || editor.email || "Unknown user"])
  );

  const historyByChargeId = new Map<string, ChargeEditHistoryEntryDTO[]>();

  for (const row of historyRows ?? []) {
    const entries = historyByChargeId.get(row.charge_id) ?? [];
    entries.push({
      id: row.id,
      chargeId: row.charge_id,
      editedBy: row.edited_by,
      editedByName: editorNameById.get(row.edited_by) ?? "Unknown user",
      fieldName: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      createdAt: row.created_at
    });
    historyByChargeId.set(row.charge_id, entries);
  }

  return historyByChargeId;
}
