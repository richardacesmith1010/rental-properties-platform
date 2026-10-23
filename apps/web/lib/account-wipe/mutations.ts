import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sideEffectError } from "@/lib/logger";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type { DeletionScope } from "./scope";

export async function executeMutation(
  query: PromiseLike<{ error: { code?: string; message?: string } | null }>,
  label: string
) {
  const { error } = await query;
  if (error && !isMissingSchemaError(error)) {
    throw new Error(`${label}: ${error.message ?? "Unknown error."}`);
  }
}

export async function deleteByIds(
  table: string,
  column: string,
  ids: string[],
  label: string
) {
  if (ids.length === 0) {
    return;
  }
  const admin = createAdminClient();
  await executeMutation(admin.from(table).delete().in(column, ids), label);
}

export async function updateByIds(
  table: string,
  values: Record<string, unknown>,
  column: string,
  ids: string[],
  label: string
) {
  if (ids.length === 0) {
    return;
  }
  const admin = createAdminClient();
  await executeMutation(admin.from(table).update(values).in(column, ids), label);
}

export async function removeStorageObjects(bucket: string, paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    sideEffectError("accountWipe", "remove_storage_objects", {
      entityType: bucket
    })(error);
  }
}

export async function deleteDistributionRecords(scope: DeletionScope) {
  await deleteByIds("payment_distributions", "payment_id", scope.paymentIds, "Delete payment distributions by payment");
  await deleteByIds("payment_distributions", "account_id", scope.accountIds, "Delete payment distributions by account");
}

export async function deleteLeaseFinancials(scope: DeletionScope) {
  await deleteDistributionRecords(scope);
  await deleteByIds("payments", "id", scope.paymentIds, "Delete payments");
  await deleteByIds("rent_charges", "id", scope.chargeIds, "Delete rent charges");
  await deleteByIds("autopay_enrollments", "lease_id", scope.leaseIds, "Delete autopay enrollments");
}

export async function deleteLeasingPipeline(scope: DeletionScope) {
  await deleteByIds("screening_reports", "application_id", scope.applicationIds, "Delete screening reports");
  await deleteByIds("application_events", "application_id", scope.applicationIds, "Delete application events");
  await deleteByIds("rental_applications", "id", scope.applicationIds, "Delete rental applications");
  await deleteByIds("rental_listings", "id", scope.listingIds, "Delete rental listings");
}

export async function deleteDocuments(scope: DeletionScope, includeTemplates = false) {
  await deleteByIds("document_signers", "packet_id", scope.documentPacketIds, "Delete document signers");
  await deleteByIds("document_packets", "id", scope.documentPacketIds, "Delete document packets");
  await removeStorageObjects(
    "property-files",
    scope.propertyFiles.map((file) => file.storage_path)
  );
  await deleteByIds("property_files", "id", scope.propertyFiles.map((file) => file.id), "Delete property files");
  if (includeTemplates) {
    await deleteByIds("document_templates", "id", scope.documentTemplateIds, "Delete document templates");
  }
}

export async function deleteMaintenance(scope: DeletionScope) {
  await deleteByIds("maintenance_assignments", "ticket_id", scope.ticketIds, "Delete maintenance assignments");
  await removeStorageObjects(
    "maintenance-photos",
    scope.maintenancePhotos.map((photo) => photo.storage_path)
  );
  await deleteByIds(
    "maintenance_photos",
    "id",
    scope.maintenancePhotos.map((photo) => photo.id),
    "Delete maintenance photos"
  );
  await deleteByIds("maintenance_tickets", "id", scope.ticketIds, "Delete maintenance tickets");
}

export async function deleteAutomation(scope: DeletionScope) {
  await deleteByIds("automation_runs", "rule_id", scope.automationRuleIds, "Delete automation runs");
  await deleteByIds("automation_rules", "id", scope.automationRuleIds, "Delete automation rules");
}
