import { describe, expect, it } from "vitest";
import { deriveFeatureCapabilities } from "@/lib/feature-capabilities";

const baseProbe = {
  documentTemplatesTable: true,
  documentPacketsTable: true,
  documentSignersTable: true,
  notificationsTable: true,
  notificationDeliveriesTable: true,
  vendorsTable: true,
  maintenanceAssignmentsTable: true,
  maintenancePhotosTable: true,
  ownershipAccountsTable: true,
  ownershipAccountMembersTable: true,
  rentalApplicationsTable: true,
  screeningReportsTable: true,
  applicationEventsTable: true,
  inboxThreadsTable: true,
  inboxMessagesTable: true,
  messageDeliveriesTable: true,
  automationTemplatesTable: true,
  automationRulesTable: true,
  automationRunsTable: true,
  propertiesOwnerAccountColumn: true,
  invitationsOwnershipAccountColumn: true,
  leaseDocumentsBucket: true,
  maintenancePhotosBucket: true
};

describe("deriveFeatureCapabilities", () => {
  it("enables all feature flags when schema and buckets are ready", () => {
    const capabilities = deriveFeatureCapabilities(baseProbe);

    expect(capabilities.documentsEnabled).toBe(true);
    expect(capabilities.documentAssetAccessEnabled).toBe(true);
    expect(capabilities.notificationsEnabled).toBe(true);
    expect(capabilities.vendorWorkflowEnabled).toBe(true);
    expect(capabilities.photoWorkflowEnabled).toBe(true);
    expect(capabilities.ownershipEnabled).toBe(true);
    expect(capabilities.leasingPipelineEnabled).toBe(true);
    expect(capabilities.inboxThreadsEnabled).toBe(true);
    expect(capabilities.automationsEnabled).toBe(true);
    expect(capabilities.warnings).toEqual({});
  });

  it("disables documents when required tables are missing", () => {
    const capabilities = deriveFeatureCapabilities({
      ...baseProbe,
      documentPacketsTable: false
    });

    expect(capabilities.documentsEnabled).toBe(false);
    expect(capabilities.documentAssetAccessEnabled).toBe(false);
    expect(capabilities.warnings.documents).toContain("Phase 8");
  });

  it("keeps document workflows enabled but disables file access when bucket is missing", () => {
    const capabilities = deriveFeatureCapabilities({
      ...baseProbe,
      leaseDocumentsBucket: false,
      leaseDocumentsBucketReason: "bucket missing"
    });

    expect(capabilities.documentsEnabled).toBe(true);
    expect(capabilities.documentAssetAccessEnabled).toBe(false);
    expect(capabilities.warnings.documents).toBe("bucket missing");
  });

  it("disables photo workflows when photo bucket is unavailable", () => {
    const capabilities = deriveFeatureCapabilities({
      ...baseProbe,
      maintenancePhotosBucket: false,
      maintenancePhotosBucketReason: "photo bucket missing"
    });

    expect(capabilities.photoWorkflowEnabled).toBe(false);
    expect(capabilities.warnings.photoWorkflow).toBe("photo bucket missing");
  });

  it("disables ownership workflows when phase 9 schema is missing", () => {
    const capabilities = deriveFeatureCapabilities({
      ...baseProbe,
      ownershipAccountsTable: false,
      ownershipAccountMembersTable: false,
      propertiesOwnerAccountColumn: false,
      invitationsOwnershipAccountColumn: false
    });

    expect(capabilities.ownershipEnabled).toBe(false);
    expect(capabilities.warnings.ownership).toContain("Phase 9");
  });

  it("disables phase A capabilities when v2 tables are missing", () => {
    const capabilities = deriveFeatureCapabilities({
      ...baseProbe,
      rentalApplicationsTable: false,
      inboxThreadsTable: false,
      automationTemplatesTable: false
    });

    expect(capabilities.leasingPipelineEnabled).toBe(false);
    expect(capabilities.inboxThreadsEnabled).toBe(false);
    expect(capabilities.automationsEnabled).toBe(false);
    expect(capabilities.warnings.leasingPipeline).toContain("V2 Phase A");
    expect(capabilities.warnings.inboxThreads).toContain("V2 Phase A");
    expect(capabilities.warnings.automations).toContain("V2 Phase A");
  });
});
