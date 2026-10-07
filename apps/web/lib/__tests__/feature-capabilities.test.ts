import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({ values: new Map<string, { value: unknown; expiresAt: number }>() }));
const adminState = vi.hoisted(() => ({
  bucketCalls: 0,
  probeCalls: 0,
  probeErrors: new Map<string, unknown[]>()
}));

vi.mock("next/cache", () => ({
  revalidateTag: () => cacheState.values.clear(),
  unstable_cache: <T extends () => Promise<unknown>>(
    work: T,
    keys: string[],
    options: { revalidate: number }
  ) => async () => {
    const key = keys.join(":");
    const cached = cacheState.values.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    const value = await work();
    cacheState.values.set(key, { value, expiresAt: Date.now() + options.revalidate * 1000 });
    return value;
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => ({
      select: (columnName: string) => ({
        limit: async () => {
          adminState.probeCalls += 1;
          const key = `${tableName}.${columnName}`;
          const errors = adminState.probeErrors.get(key) ?? adminState.probeErrors.get(tableName) ?? [];
          return { error: errors.shift() ?? null };
        }
      })
    }),
    storage: {
      getBucket: async (bucketName: string) => {
        adminState.bucketCalls += 1;
        return { data: { id: bucketName }, error: null };
      }
    }
  })
}));

import {
  deriveFeatureCapabilities,
  getFeatureCapabilities,
  invalidateFeatureCapabilitiesCache
} from "@/lib/feature-capabilities";

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
  rentalListingsTable: true,
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
      rentalListingsTable: false,
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

describe("getFeatureCapabilities", () => {
  beforeEach(() => {
    adminState.bucketCalls = 0;
    adminState.probeCalls = 0;
  });

  it("returns the all-available production fixture without client calls", async () => {
    const expected = deriveFeatureCapabilities(baseProbe);
    expect(await getFeatureCapabilities()).toEqual(expected);
    invalidateFeatureCapabilitiesCache();
    expect(await getFeatureCapabilities()).toEqual(expected);
    expect(adminState.probeCalls).toBe(0);
    expect(adminState.bucketCalls).toBe(0);
  });
});
