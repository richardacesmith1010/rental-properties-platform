import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FeatureCapabilitiesDTO {
  documentsEnabled: boolean;
  documentAssetAccessEnabled: boolean;
  notificationsEnabled: boolean;
  vendorWorkflowEnabled: boolean;
  photoWorkflowEnabled: boolean;
  ownershipEnabled: boolean;
  leasingPipelineEnabled: boolean;
  inboxThreadsEnabled: boolean;
  automationsEnabled: boolean;
  warnings: {
    documents?: string;
    notifications?: string;
    vendorWorkflow?: string;
    photoWorkflow?: string;
    ownership?: string;
    leasingPipeline?: string;
    inboxThreads?: string;
    automations?: string;
  };
}

interface FeatureCapabilityProbe {
  documentTemplatesTable: boolean;
  documentPacketsTable: boolean;
  documentSignersTable: boolean;
  notificationsTable: boolean;
  notificationDeliveriesTable: boolean;
  vendorsTable: boolean;
  maintenanceAssignmentsTable: boolean;
  maintenancePhotosTable: boolean;
  ownershipAccountsTable: boolean;
  ownershipAccountMembersTable: boolean;
  rentalListingsTable: boolean;
  rentalApplicationsTable: boolean;
  screeningReportsTable: boolean;
  applicationEventsTable: boolean;
  inboxThreadsTable: boolean;
  inboxMessagesTable: boolean;
  messageDeliveriesTable: boolean;
  automationTemplatesTable: boolean;
  automationRulesTable: boolean;
  automationRunsTable: boolean;
  propertiesOwnerAccountColumn: boolean;
  invitationsOwnershipAccountColumn: boolean;
  leaseDocumentsBucket: boolean;
  maintenancePhotosBucket: boolean;
  leaseDocumentsBucketReason?: string;
  maintenancePhotosBucketReason?: string;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeCode = "code" in error ? String(error.code ?? "") : "";
  const maybeMessage = "message" in error ? String(error.message ?? "") : "";
  const normalizedMessage = maybeMessage.toLowerCase();

  if (maybeCode === "42P01" || maybeCode === "PGRST205") {
    return true;
  }

  return (
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("could not find the table") ||
    normalizedMessage.includes("relation")
  );
}

async function probeTable(
  supabase: ReturnType<typeof createClient>,
  tableName: string
): Promise<boolean> {
  const { error } = await supabase
    .from(tableName)
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (!error) {
    return true;
  }

  if (isMissingTableError(error)) {
    return false;
  }

  // Non-schema errors should not disable features preemptively.
  return true;
}

async function probeColumn(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const { error } = await supabase
    .from(tableName)
    .select(columnName, { head: true, count: "exact" })
    .limit(1);

  if (!error) {
    return true;
  }

  if (isMissingTableError(error)) {
    return false;
  }

  const maybeCode = typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "";
  const maybeMessage = typeof error === "object" && error && "message" in error ? String(error.message ?? "").toLowerCase() : "";

  if (maybeCode === "42703" || maybeMessage.includes("column") && maybeMessage.includes("does not exist")) {
    return false;
  }

  // Non-schema errors should not disable features preemptively.
  return true;
}

async function probeBucket(bucketName: string): Promise<{ exists: boolean; reason?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket(bucketName);

    if (error || !data?.id) {
      return {
        exists: false,
        reason: `Storage bucket \"${bucketName}\" is not available yet.`
      };
    }

    return { exists: true };
  } catch (error) {
    return {
      exists: false,
      reason:
        error instanceof Error
          ? error.message
          : `Failed to validate storage bucket \"${bucketName}\".`
    };
  }
}

export function deriveFeatureCapabilities(probe: FeatureCapabilityProbe): FeatureCapabilitiesDTO {
  const documentsTablesReady =
    probe.documentTemplatesTable && probe.documentPacketsTable && probe.documentSignersTable;
  const notificationsTablesReady =
    probe.notificationsTable && probe.notificationDeliveriesTable;
  const vendorTablesReady = probe.vendorsTable && probe.maintenanceAssignmentsTable;
  const photoTablesReady = probe.maintenancePhotosTable;
  const ownershipReady =
    probe.ownershipAccountsTable &&
    probe.ownershipAccountMembersTable &&
    probe.propertiesOwnerAccountColumn &&
    probe.invitationsOwnershipAccountColumn;
  const leasingPipelineReady =
    probe.rentalListingsTable &&
    probe.rentalApplicationsTable &&
    probe.screeningReportsTable &&
    probe.applicationEventsTable;
  const inboxThreadsReady =
    probe.inboxThreadsTable &&
    probe.inboxMessagesTable &&
    probe.messageDeliveriesTable;
  const automationsReady =
    probe.automationTemplatesTable &&
    probe.automationRulesTable &&
    probe.automationRunsTable;

  const warnings: FeatureCapabilitiesDTO["warnings"] = {};

  if (!documentsTablesReady) {
    warnings.documents = "Documents and e-sign are not ready yet. Run the Phase 8 migration to enable this section.";
  } else if (!probe.leaseDocumentsBucket) {
    warnings.documents =
      probe.leaseDocumentsBucketReason ??
      "Document storage is not configured yet. Packet records will work, but file previews are disabled.";
  }

  if (!notificationsTablesReady) {
    warnings.notifications =
      "Notifications are not ready yet. Run the Phase 8 migration to enable in-app and email delivery records.";
  }

  if (!vendorTablesReady) {
    warnings.vendorWorkflow =
      "Vendor assignments are not ready yet. Run the Phase 8 migration to enable this workflow.";
  }

  if (!photoTablesReady) {
    warnings.photoWorkflow =
      "Maintenance photo tracking is not ready yet. Run the Phase 8 migration to enable uploads.";
  } else if (!probe.maintenancePhotosBucket) {
    warnings.photoWorkflow =
      probe.maintenancePhotosBucketReason ??
      "Maintenance photo storage is not configured yet. Upload and preview are disabled.";
  }

  if (!ownershipReady) {
    warnings.ownership =
      "LLC/shared ownership is not ready yet. Run the Phase 9 migration to enable ownership accounts and co-owner access.";
  }

  if (!leasingPipelineReady) {
    warnings.leasingPipeline =
      "Leasing pipeline persistence is not ready yet. Run the V2 Phase A migration to enable listings, applications, and screening records.";
  }

  if (!inboxThreadsReady) {
    warnings.inboxThreads =
      "Threaded inbox persistence is not ready yet. Run the V2 Phase A migration to enable conversation threads and delivery tracking.";
  }

  if (!automationsReady) {
    warnings.automations =
      "Automation execution persistence is not ready yet. Run the V2 Phase A migration to enable server-side flow rules and run history.";
  }

  return {
    documentsEnabled: documentsTablesReady,
    documentAssetAccessEnabled: documentsTablesReady && probe.leaseDocumentsBucket,
    notificationsEnabled: notificationsTablesReady,
    vendorWorkflowEnabled: vendorTablesReady,
    photoWorkflowEnabled: photoTablesReady && probe.maintenancePhotosBucket,
    ownershipEnabled: ownershipReady,
    leasingPipelineEnabled: leasingPipelineReady,
    inboxThreadsEnabled: inboxThreadsReady,
    automationsEnabled: automationsReady,
    warnings
  };
}

export async function getFeatureCapabilities(): Promise<FeatureCapabilitiesDTO> {
  const supabase = createClient();

  const [
    documentTemplatesTable,
    documentPacketsTable,
    documentSignersTable,
    notificationsTable,
    notificationDeliveriesTable,
    vendorsTable,
    maintenanceAssignmentsTable,
    maintenancePhotosTable,
    ownershipAccountsTable,
    ownershipAccountMembersTable,
    rentalListingsTable,
    rentalApplicationsTable,
    screeningReportsTable,
    applicationEventsTable,
    inboxThreadsTable,
    inboxMessagesTable,
    messageDeliveriesTable,
    automationTemplatesTable,
    automationRulesTable,
    automationRunsTable,
    propertiesOwnerAccountColumn,
    invitationsOwnershipAccountColumn,
    leaseDocumentsBucketProbe,
    maintenancePhotosBucketProbe
  ] = await Promise.all([
    probeTable(supabase, "document_templates"),
    probeTable(supabase, "document_packets"),
    probeTable(supabase, "document_signers"),
    probeTable(supabase, "notifications"),
    probeTable(supabase, "notification_deliveries"),
    probeTable(supabase, "vendors"),
    probeTable(supabase, "maintenance_assignments"),
    probeTable(supabase, "maintenance_photos"),
    probeTable(supabase, "ownership_accounts"),
    probeTable(supabase, "ownership_account_members"),
    probeTable(supabase, "rental_listings"),
    probeTable(supabase, "rental_applications"),
    probeTable(supabase, "screening_reports"),
    probeTable(supabase, "application_events"),
    probeTable(supabase, "inbox_threads"),
    probeTable(supabase, "inbox_messages"),
    probeTable(supabase, "message_deliveries"),
    probeTable(supabase, "automation_templates"),
    probeTable(supabase, "automation_rules"),
    probeTable(supabase, "automation_runs"),
    probeColumn(supabase, "properties", "owner_account_id"),
    probeColumn(supabase, "invitations", "ownership_account_id"),
    probeBucket("lease-documents"),
    probeBucket("maintenance-photos")
  ]);

  return deriveFeatureCapabilities({
    documentTemplatesTable,
    documentPacketsTable,
    documentSignersTable,
    notificationsTable,
    notificationDeliveriesTable,
    vendorsTable,
    maintenanceAssignmentsTable,
    maintenancePhotosTable,
    ownershipAccountsTable,
    ownershipAccountMembersTable,
    rentalListingsTable,
    rentalApplicationsTable,
    screeningReportsTable,
    applicationEventsTable,
    inboxThreadsTable,
    inboxMessagesTable,
    messageDeliveriesTable,
    automationTemplatesTable,
    automationRulesTable,
    automationRunsTable,
    propertiesOwnerAccountColumn,
    invitationsOwnershipAccountColumn,
    leaseDocumentsBucket: leaseDocumentsBucketProbe.exists,
    maintenancePhotosBucket: maintenancePhotosBucketProbe.exists,
    leaseDocumentsBucketReason: leaseDocumentsBucketProbe.reason,
    maintenancePhotosBucketReason: maintenancePhotosBucketProbe.reason
  });
}
