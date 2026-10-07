// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildOwnerBundlePlan } from "@/app/owner/page-data/bundle-plan";

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
      "announcement-properties", "dashboard", "expenses", "feedback", "invitations", "manager-payments",
      "notification-preferences", "notifications", "ownership-members", "portfolio", "rent-collection-status", "tickets"
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

  it("defers Home-only bundles on the first render and preserves section plans", () => {
    const home = buildOwnerBundlePlan({
      capabilities, initialOwnerHomePage: true, deferHomeOnlyBundles: true,
      initialSectionId: null, isLlcAccount: true, sectionAvailability
    });
    expect([...home.bundles].sort()).toEqual([
      "announcement-properties", "dashboard", "notification-preferences", "notifications",
      "ownership-members", "portfolio", "rent-collection-status"
    ]);
    for (const section of ["charges", "maintenance", "expenses", "leasing"]) {
      const base = { capabilities, initialOwnerHomePage: false, initialSectionId: section,
        isLlcAccount: false, sectionAvailability };
      expect([...buildOwnerBundlePlan({ ...base, deferHomeOnlyBundles: true }).bundles])
        .toEqual([...buildOwnerBundlePlan(base).bundles]);
    }
  });

  it("loads only the section-specific bundles for a deferred records section", () => {
    const bundlePlan = buildOwnerBundlePlan({
      capabilities,
      initialOwnerHomePage: false,
      initialSectionId: "applications",
      isLlcAccount: false,
      sectionAvailability: { ...sectionAvailability, hasManagerPaymentsSection: false, hasMembersSection: false }
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

  it("keeps Home bundle requirements independent of manager visibility timing", () => {
    const makePlan = (hasManagerPaymentsSection: boolean) => buildOwnerBundlePlan({
      capabilities,
      initialOwnerHomePage: true,
      initialSectionId: null,
      isLlcAccount: true,
      sectionAvailability: { ...sectionAvailability, hasManagerPaymentsSection }
    });

    expect([...makePlan(false).bundles]).toEqual([...makePlan(true).bundles]);
    expect(makePlan(true).sectionAvailability.hasManagerPaymentsSection).toBe(true);
  });

  it("always includes the bundles started as soon as the owner page is ready", () => {
    const cases = [
      { initialOwnerHomePage: true, deferHomeOnlyBundles: false, initialSectionId: null, isLlcAccount: true },
      { initialOwnerHomePage: true, deferHomeOnlyBundles: true, initialSectionId: null, isLlcAccount: false },
      ...[
        "overview", "charges", "maintenance", "leasing", "applications", "inbox", "automations", "activity",
        "ownership", "members", "invitations", "documents", "vendors", "expenses", "analytics", "leases",
        "manager-payments", "unknown"
      ].map(initialSectionId => ({ initialOwnerHomePage: false, initialSectionId, isLlcAccount: false }))
    ];

    for (const params of cases) {
      const plan = buildOwnerBundlePlan({ ...params, capabilities, sectionAvailability });
      expect(plan.bundles.has("announcement-properties")).toBe(true);
      expect(plan.bundles.has("notifications")).toBe(true);
      expect(plan.bundles.has("notification-preferences")).toBe(true);
    }
  });
});
