import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sideEffectError } from "@/lib/logger";
import type { DeletionScope } from "./scope";

export type WipeFilter =
  | { op: "in"; column: string; values: string[] }
  | { op: "eq"; column: string; value: string }
  | { op: "not_null"; column: string };

export type WipeOp = {
  table: string;
  kind: "delete" | "update";
  label: string;
  filters: WipeFilter[];
  set?: { occupied: false };
};

export function createWipePlan(action = "accountWipe") {
  const ops: WipeOp[] = [];
  const storage: Array<{ bucket: string; paths: string[] }> = [];
  return {
    action, ops, storage,
    deleteIn(table: string, column: string, ids: string[], label: string) {
      if (ids.length) ops.push({ table, kind: "delete", label, filters: [{ op: "in", column, values: ids }] });
    },
    deleteWhere(table: string, filters: WipeFilter[], label: string) {
      ops.push({ table, kind: "delete", label, filters });
    },
    updateIn(table: "units", set: { occupied: false }, column: string, ids: string[], label: string) {
      if (ids.length) ops.push({ table, kind: "update", set, label, filters: [{ op: "in", column, values: ids }] });
    },
    removeStorage(bucket: string, paths: string[]) {
      if (paths.length) storage.push({ bucket, paths });
    }
  };
}

export type WipePlan = ReturnType<typeof createWipePlan>;
export type RpcOutcome = "database_rollback_confirmed" | "rpc_result_unknown";

export function classifyWipeRpcError(error: unknown): RpcOutcome {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "PGRST202" || code === "PGRST203") return "database_rollback_confirmed";
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) &&
    !code.startsWith("08") && !["57P01", "57P02", "57P03"].includes(code)) {
    return "database_rollback_confirmed";
  }
  return "rpc_result_unknown";
}

export function validateWipeRpcResult(data: unknown, ops: WipeOp[]): boolean {
  if (!data || typeof data !== "object") return false;
  const result = data as { operations?: unknown; results?: unknown };
  if (result.operations !== ops.length || !Array.isArray(result.results) || result.results.length !== ops.length) {
    return false;
  }
  return result.results.every((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as { label?: unknown; rows?: unknown; skipped?: unknown };
    if (value.label !== ops[index].label) return false;
    if (value.skipped === true) {
      return value.rows === undefined;
    }
    return value.skipped === undefined && Number.isInteger(value.rows) && (value.rows as number) >= 0;
  });
}

export async function applyWipePlan(
  plan: WipePlan, guard: { userId: string; scope: DeletionScope }
): Promise<void> {
  const admin = createAdminClient();
  let response: { data: unknown; error: unknown };
  try {
    response = await admin.rpc("account_wipe_apply", {
      p_ops: plan.ops,
      p_guard: {
        user_id: guard.userId,
        account_ids: guard.scope.accountIds,
        property_ids: guard.scope.propertyIds
      }
    });
  } catch {
    sideEffectError(plan.action, "rpc_result_unknown")(new Error("RPC did not respond"));
    throw new Error("Account wipe RPC outcome unknown");
  }
  if (!response || typeof response !== "object") {
    sideEffectError(plan.action, "rpc_result_unknown")(new Error("Invalid RPC response"));
    throw new Error("Account wipe RPC outcome unknown");
  }
  if (response.error) {
    const category = classifyWipeRpcError(response.error);
    sideEffectError(plan.action, category)(new Error("Account wipe RPC error"));
    throw new Error(`Account wipe ${category}`);
  }
  if (!validateWipeRpcResult(response.data, plan.ops)) {
    sideEffectError(plan.action, "rpc_result_unknown")(new Error("Invalid RPC response"));
    throw new Error("Account wipe RPC outcome unknown");
  }
  const skipped = (response.data as { results: Array<{ label: string; skipped?: boolean }> }).results
    .filter((entry) => entry.skipped === true).map((entry) => entry.label);
  if (skipped.length) {
    sideEffectError(plan.action, "committed_with_skip")(
      new Error(`Skipped ${skipped.length} operations: ${skipped.join(", ")}`)
    );
  }
  for (const { bucket, paths } of plan.storage) {
    try {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        sideEffectError("accountWipe", "remove_storage_objects", { entityType: bucket })(error);
        sideEffectError(plan.action, "storage_cleanup_failed")(error);
      }
    } catch {
      const error = new Error("Storage removal failed");
      sideEffectError("accountWipe", "remove_storage_objects", { entityType: bucket })(error);
      sideEffectError(plan.action, "storage_cleanup_failed")(error);
    }
  }
}

export function deleteDistributionRecords(plan: WipePlan, scope: DeletionScope) {
  plan.deleteIn("payment_distributions", "payment_id", scope.paymentIds, "Delete payment distributions by payment");
  plan.deleteIn("payment_distributions", "account_id", scope.accountIds, "Delete payment distributions by account");
}

export function deleteLeaseFinancials(plan: WipePlan, scope: DeletionScope) {
  deleteDistributionRecords(plan, scope);
  plan.deleteIn("payments", "id", scope.paymentIds, "Delete payments");
  plan.deleteIn("rent_charges", "id", scope.chargeIds, "Delete rent charges");
  plan.deleteIn("autopay_enrollments", "lease_id", scope.leaseIds, "Delete autopay enrollments");
}

export function deleteLeasingPipeline(plan: WipePlan, scope: DeletionScope) {
  plan.deleteIn("screening_reports", "application_id", scope.applicationIds, "Delete screening reports");
  plan.deleteIn("application_events", "application_id", scope.applicationIds, "Delete application events");
  plan.deleteIn("rental_applications", "id", scope.applicationIds, "Delete rental applications");
  plan.deleteIn("rental_listings", "id", scope.listingIds, "Delete rental listings");
}

export function deleteDocuments(plan: WipePlan, scope: DeletionScope, includeTemplates = false) {
  plan.deleteIn("document_signers", "packet_id", scope.documentPacketIds, "Delete document signers");
  plan.deleteIn("document_packets", "id", scope.documentPacketIds, "Delete document packets");
  plan.removeStorage("property-files", scope.propertyFiles.map((file) => file.storage_path));
  plan.deleteIn("property_files", "id", scope.propertyFiles.map((file) => file.id), "Delete property files");
  if (includeTemplates) {
    plan.deleteIn("document_templates", "id", scope.documentTemplateIds, "Delete document templates");
  }
}

export function deleteMaintenance(plan: WipePlan, scope: DeletionScope) {
  plan.deleteIn("maintenance_assignments", "ticket_id", scope.ticketIds, "Delete maintenance assignments");
  plan.removeStorage("maintenance-photos", scope.maintenancePhotos.map((photo) => photo.storage_path));
  plan.deleteIn("maintenance_photos", "id", scope.maintenancePhotos.map((photo) => photo.id), "Delete maintenance photos");
  plan.deleteIn("maintenance_tickets", "id", scope.ticketIds, "Delete maintenance tickets");
}

export function deleteAutomation(plan: WipePlan, scope: DeletionScope) {
  plan.deleteIn("automation_runs", "rule_id", scope.automationRuleIds, "Delete automation runs");
  plan.deleteIn("automation_rules", "id", scope.automationRuleIds, "Delete automation rules");
}
