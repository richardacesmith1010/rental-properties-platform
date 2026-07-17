import { describe, expect, it } from "vitest";
import { buildOwnerBundlePlan, resolveOwnerPageRequest } from "@/app/owner/owner-page-data";

describe("resolveOwnerPageRequest", () => {
  it("treats the owner daily ops home as the default first paint", () => {
    const request = resolveOwnerPageRequest({}, [{ id: "account-1" }] as never);

    expect(request.activeAccountId).toBe("account-1");
    expect(request.initialOwnerHomePage).toBe(true);
    expect(request.initialOwnerWorkflowMode).toBeUndefined();
    expect(request.initialSectionId).toBeNull();
  });
});

describe("buildOwnerBundlePlan", () => {
  const capabilities = {
    documentsEnabled: true,
    documentAssetAccessEnabled: true,
    notificationsEnabled: true,
    vendorWorkflowEnabled: true,
    photoWorkflowEnabled: true,
    ownershipEnabled: true,
    leasingPipelineEnabled: true,
    inboxThreadsEnabled: true,
    automationsEnabled: true,
    warnings: {}
  } as const;
  const sectionAvailability = {
    hasActivitySection: true,
    hasAnalyticsSection: true,
    hasApplicationsSection: true,
    hasAutomationsSection: true,
    hasDocumentsSection: true,
    hasExpensesSection: true,
    hasInboxSection: true,
    hasInvitationsSection: true,
    hasLeasingSection: true,
    hasManagerPaymentsSection: true,
    hasMembersSection: true,
    hasNotificationsSection: true,
    hasOwnershipSection: true,
    hasVendorsSection: true
  } as const;

  it("keeps first paint scoped to the owner home bundles", () => {
    const bundlePlan = buildOwnerBundlePlan({
      capabilities,
      initialOwnerHomePage: true,
      initialSectionId: null,
      isLlcAccount: true,
      sectionAvailability
    });

    expect(Array.from(bundlePlan.bundles).sort()).toEqual([
      "announcement-properties",
      "dashboard",
      "expenses",
      "feedback",
      "gamification",
      "manager-payments",
      "notification-preferences",
      "notifications",
      "ownership-members",
      "portfolio",
      "rent-collection-status",
      "tickets"
    ]);
    expect(bundlePlan.sectionAvailability).toEqual(sectionAvailability);
    expect(bundlePlan.bundles.has("analytics")).toBe(false);
    expect(bundlePlan.bundles.has("applications")).toBe(false);
    expect(bundlePlan.bundles.has("automations")).toBe(false);
    expect(bundlePlan.bundles.has("documents")).toBe(false);
    expect(bundlePlan.bundles.has("inbox")).toBe(false);
    expect(bundlePlan.bundles.has("listings")).toBe(false);
    expect(bundlePlan.bundles.has("owner-connected-map")).toBe(false);
    expect(bundlePlan.bundles.has("vendors")).toBe(false);
    expect(bundlePlan.sectionAvailability.hasAnalyticsSection).toBe(true);
    expect(bundlePlan.sectionAvailability.hasManagerPaymentsSection).toBe(true);
  });

  it("loads only the section-specific bundles for a deferred records section", () => {
    const bundlePlan = buildOwnerBundlePlan({
      capabilities,
      initialOwnerHomePage: false,
      initialSectionId: "applications",
      isLlcAccount: false,
      sectionAvailability: {
        ...sectionAvailability,
        hasManagerPaymentsSection: false,
        hasMembersSection: false
      }
    });

    expect(bundlePlan.bundles.has("applications")).toBe(true);
    expect(bundlePlan.bundles.has("listings")).toBe(true);
    expect(bundlePlan.bundles.has("expenses")).toBe(false);
    expect(bundlePlan.bundles.has("feedback")).toBe(false);
    expect(bundlePlan.bundles.has("inbox")).toBe(false);
    expect(bundlePlan.bundles.has("manager-payments")).toBe(false);
    expect(bundlePlan.bundles.has("tickets")).toBe(false);
    expect(bundlePlan.sectionAvailability.hasApplicationsSection).toBe(true);
  });
});
