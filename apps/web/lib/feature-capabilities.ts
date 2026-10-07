// Capability existence is checked by verify:capabilities at the gate and daily smoke.
// Page requests use the production contract without any database or storage calls.

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
      "Leasing pipeline persistence is not ready yet. Run the V2 Phase A migration to enable listings, " +
      "applications, and screening records.";
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

const PRODUCTION_CAPABILITIES: FeatureCapabilitiesDTO = deriveFeatureCapabilities({
  documentTemplatesTable: true, documentPacketsTable: true, documentSignersTable: true,
  notificationsTable: true, notificationDeliveriesTable: true, vendorsTable: true,
  maintenanceAssignmentsTable: true, maintenancePhotosTable: true, ownershipAccountsTable: true,
  ownershipAccountMembersTable: true, rentalListingsTable: true, rentalApplicationsTable: true,
  screeningReportsTable: true, applicationEventsTable: true, inboxThreadsTable: true,
  inboxMessagesTable: true, messageDeliveriesTable: true, automationTemplatesTable: true,
  automationRulesTable: true, automationRunsTable: true, propertiesOwnerAccountColumn: true,
  invitationsOwnershipAccountColumn: true, leaseDocumentsBucket: true, maintenancePhotosBucket: true
});

export async function getFeatureCapabilities(): Promise<FeatureCapabilitiesDTO> {
  return PRODUCTION_CAPABILITIES;
}

export function invalidateFeatureCapabilitiesCache(): void {
  // Kept for callers that invalidate after mutations; the contract is static at runtime.
}
