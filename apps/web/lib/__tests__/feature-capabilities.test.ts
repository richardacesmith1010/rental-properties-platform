import { describe, expect, it } from "vitest";
import { deriveFeatureCapabilities } from "@/lib/feature-capabilities";

describe("deriveFeatureCapabilities", () => {
  it("enables all feature flags when tables and buckets are ready", () => {
    const capabilities = deriveFeatureCapabilities({
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
      propertiesOwnerAccountColumn: true,
      invitationsOwnershipAccountColumn: true,
      leaseDocumentsBucket: true,
      maintenancePhotosBucket: true,
    });

    expect(capabilities.documentsEnabled).toBe(true);
    expect(capabilities.documentAssetAccessEnabled).toBe(true);
    expect(capabilities.notificationsEnabled).toBe(true);
    expect(capabilities.vendorWorkflowEnabled).toBe(true);
    expect(capabilities.photoWorkflowEnabled).toBe(true);
    expect(capabilities.ownershipEnabled).toBe(true);
    expect(capabilities.warnings).toEqual({});
  });

  it("disables documents when required tables are missing", () => {
    const capabilities = deriveFeatureCapabilities({
      documentTemplatesTable: true,
      documentPacketsTable: false,
      documentSignersTable: true,
      notificationsTable: true,
      notificationDeliveriesTable: true,
      vendorsTable: true,
      maintenanceAssignmentsTable: true,
      maintenancePhotosTable: true,
      ownershipAccountsTable: true,
      ownershipAccountMembersTable: true,
      propertiesOwnerAccountColumn: true,
      invitationsOwnershipAccountColumn: true,
      leaseDocumentsBucket: true,
      maintenancePhotosBucket: true,
    });

    expect(capabilities.documentsEnabled).toBe(false);
    expect(capabilities.documentAssetAccessEnabled).toBe(false);
    expect(capabilities.warnings.documents).toContain("Phase 8");
  });

  it("keeps document workflows enabled but disables file access when bucket is missing", () => {
    const capabilities = deriveFeatureCapabilities({
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
      propertiesOwnerAccountColumn: true,
      invitationsOwnershipAccountColumn: true,
      leaseDocumentsBucket: false,
      maintenancePhotosBucket: true,
      leaseDocumentsBucketReason: "bucket missing"
    });

    expect(capabilities.documentsEnabled).toBe(true);
    expect(capabilities.documentAssetAccessEnabled).toBe(false);
    expect(capabilities.warnings.documents).toBe("bucket missing");
  });

  it("disables photo workflows when photo bucket is unavailable", () => {
    const capabilities = deriveFeatureCapabilities({
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
      propertiesOwnerAccountColumn: true,
      invitationsOwnershipAccountColumn: true,
      leaseDocumentsBucket: true,
      maintenancePhotosBucket: false,
      maintenancePhotosBucketReason: "photo bucket missing"
    });

    expect(capabilities.photoWorkflowEnabled).toBe(false);
    expect(capabilities.warnings.photoWorkflow).toBe("photo bucket missing");
  });

  it("disables ownership workflows when phase 9 schema is missing", () => {
    const capabilities = deriveFeatureCapabilities({
      documentTemplatesTable: true,
      documentPacketsTable: true,
      documentSignersTable: true,
      notificationsTable: true,
      notificationDeliveriesTable: true,
      vendorsTable: true,
      maintenanceAssignmentsTable: true,
      maintenancePhotosTable: true,
      ownershipAccountsTable: false,
      ownershipAccountMembersTable: false,
      propertiesOwnerAccountColumn: false,
      invitationsOwnershipAccountColumn: false,
      leaseDocumentsBucket: true,
      maintenancePhotosBucket: true
    });

    expect(capabilities.ownershipEnabled).toBe(false);
    expect(capabilities.warnings.ownership).toContain("Phase 9");
  });
});
