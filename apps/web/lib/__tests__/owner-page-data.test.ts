import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerLoadMocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  ownershipAccounts: vi.fn(),
  profile: vi.fn(),
  role: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: ownerLoadMocks.role,
  getUserProfileSummary: ownerLoadMocks.profile
}));
vi.mock("@/lib/ownership", () => ({
  getOwnershipAccountsForUser: ownerLoadMocks.ownershipAccounts,
  getOwnershipMembersForAccount: vi.fn(),
  getPendingAccountDeleteRequests: vi.fn(),
  getPendingAccountRenameRequests: vi.fn()
}));
vi.mock("@/lib/feature-capabilities", () => ({
  getFeatureCapabilities: ownerLoadMocks.capabilities
}));
vi.mock("@/lib/logger", () => ({
  logPerfEvent: vi.fn(),
  measurePerf: async (_scope: string, _name: string, work: () => Promise<unknown>) => work()
}));

import {
  buildOwnerBundlePlan,
  loadOwnerPageData,
  resolveOwnerPageRequest
} from "@/app/owner/owner-page-data";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("loadOwnerPageData orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits a role failure before starting data reads", async () => {
    ownerLoadMocks.role.mockResolvedValue("manager");

    const result = await loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });

    expect(result).toEqual({ status: "role-mismatch", role: "manager" });
    expect(ownerLoadMocks.profile).not.toHaveBeenCalled();
    expect(ownerLoadMocks.ownershipAccounts).not.toHaveBeenCalled();
    expect(ownerLoadMocks.capabilities).not.toHaveBeenCalled();
  });

  it("starts profile, ownership, and capability reads concurrently after role succeeds", async () => {
    const profile = deferred<{ onboardingCompletedAt: null }>();
    const accounts = deferred<never[]>();
    const capabilities = deferred<Record<string, never>>();
    ownerLoadMocks.role.mockResolvedValue("owner");
    ownerLoadMocks.profile.mockReturnValue(profile.promise);
    ownerLoadMocks.ownershipAccounts.mockReturnValue(accounts.promise);
    ownerLoadMocks.capabilities.mockReturnValue(capabilities.promise);

    const loading = loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });
    await vi.waitFor(() => {
      expect(ownerLoadMocks.profile).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.ownershipAccounts).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.capabilities).toHaveBeenCalledOnce();
    });

    profile.resolve({ onboardingCompletedAt: null });
    accounts.resolve([]);
    capabilities.resolve({});
    const result = await loading;

    expect(result.status).toBe("needs-onboarding");
  });
});

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
