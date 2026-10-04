// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerLoadMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  tickets: vi.fn(),
  documents: vi.fn(),
  vendors: vi.fn(),
  administeredIds: vi.fn(),
  administeredOptions: vi.fn(),
  dashboard: vi.fn(),
  deleteRequests: vi.fn(),
  distributionHistory: vi.fn(),
  financialActivity: vi.fn(),
  llcInvitations: vi.fn(),
  managerPayments: vi.fn(),
  notifications: vi.fn(),
  notificationPreferences: vi.fn(),
  ownerConnected: vi.fn(),
  ownershipMembers: vi.fn(),
  pendingChanges: vi.fn(),
  pendingWithdrawals: vi.fn(),
  portfolio: vi.fn(),
  capabilities: vi.fn(),
  ownershipAccounts: vi.fn(),
  profile: vi.fn(),
  renameRequests: vi.fn(),
  rentCollectionStatus: vi.fn(),
  role: vi.fn(),
  logPerf: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: ownerLoadMocks.getUser } }) }));
vi.mock("@/lib/maintenance", () => ({ getAdminMaintenanceTickets: ownerLoadMocks.tickets }));
vi.mock("@/lib/documents", () => ({ getOwnerDocumentsData: ownerLoadMocks.documents }));
vi.mock("@/lib/vendors", () => ({ getOwnerVendors: ownerLoadMocks.vendors }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: ownerLoadMocks.role,
  getUserProfileSummary: ownerLoadMocks.profile
}));
vi.mock("@/lib/ownership", () => ({
  getOwnershipAccountsForUser: ownerLoadMocks.ownershipAccounts,
  getOwnershipMembersForAccount: ownerLoadMocks.ownershipMembers,
  getPendingAccountDeleteRequests: ownerLoadMocks.deleteRequests,
  getPendingAccountRenameRequests: ownerLoadMocks.renameRequests
}));
vi.mock("@/lib/feature-capabilities", () => ({
  getFeatureCapabilities: ownerLoadMocks.capabilities
}));
vi.mock("@/lib/logger", () => ({
  logPerfEvent: ownerLoadMocks.logPerf,
  measurePerf: async (_scope: string, _name: string, work: () => Promise<unknown>) => work()
}));
vi.mock("@/lib/dashboard", () => ({ getDashboardData: ownerLoadMocks.dashboard }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioData: ownerLoadMocks.portfolio }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIdsForAccount: ownerLoadMocks.administeredIds,
  getAdministeredPropertyOptions: ownerLoadMocks.administeredOptions
}));
vi.mock("@/lib/notifications", () => ({ getNotificationsForUser: ownerLoadMocks.notifications }));
vi.mock("@/lib/notification-preferences", () => ({
  getUserNotificationPreferenceSettings: ownerLoadMocks.notificationPreferences
}));
vi.mock("@/lib/distributions", () => ({
  getDistributionHistory: ownerLoadMocks.distributionHistory,
  getFinancialActivityFeed: ownerLoadMocks.financialActivity
}));
vi.mock("@/lib/distribution-approvals", () => ({ getPendingChangeRequests: ownerLoadMocks.pendingChanges }));
vi.mock("@/lib/withdrawals", () => ({ getPendingWithdrawals: ownerLoadMocks.pendingWithdrawals }));
vi.mock("@/lib/llc-invitations", () => ({ getPendingLLCInvitationsForAccount: ownerLoadMocks.llcInvitations }));
vi.mock("@/lib/stripe-connect", () => ({
  arePropertyOwnersConnected: ownerLoadMocks.ownerConnected,
  getRentCollectionConnectStatus: ownerLoadMocks.rentCollectionStatus
}));
vi.mock("@/lib/manager-payments-data", () => ({
  getManagerPaymentsDashboardData: ownerLoadMocks.managerPayments
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
    ownerLoadMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    ownerLoadMocks.tickets.mockResolvedValue([{ id: "ticket-1", propertyId: "property-1" }]);
    ownerLoadMocks.documents.mockResolvedValue({ templates: [], packets: [], propertyFiles: [] });
    ownerLoadMocks.vendors.mockResolvedValue([]);
    ownerLoadMocks.role.mockResolvedValue("owner");
    ownerLoadMocks.profile.mockResolvedValue({ onboardingCompletedAt: "2026-01-01" });
    ownerLoadMocks.ownershipAccounts.mockResolvedValue([{ id: "account-1", accountType: "llc" }]);
    ownerLoadMocks.capabilities.mockResolvedValue({
      automationsEnabled: true,
      documentsEnabled: true,
      inboxThreadsEnabled: true,
      leasingPipelineEnabled: true,
      notificationsEnabled: true,
      ownershipEnabled: true,
      vendorWorkflowEnabled: true,
      warnings: {}
    });
    ownerLoadMocks.administeredIds.mockResolvedValue([]);
    ownerLoadMocks.administeredOptions.mockResolvedValue([]);
    ownerLoadMocks.dashboard.mockResolvedValue({ marker: "dashboard" });
    ownerLoadMocks.portfolio.mockResolvedValue({ properties: [], units: [], leases: [], tenants: [] });
    ownerLoadMocks.notifications.mockResolvedValue([]);
    ownerLoadMocks.notificationPreferences.mockResolvedValue(null);
    ownerLoadMocks.rentCollectionStatus.mockResolvedValue({ marker: "rent-status" });
    ownerLoadMocks.ownershipMembers.mockResolvedValue([]);
    ownerLoadMocks.llcInvitations.mockResolvedValue([]);
    ownerLoadMocks.distributionHistory.mockResolvedValue([]);
    ownerLoadMocks.pendingChanges.mockResolvedValue([]);
    ownerLoadMocks.pendingWithdrawals.mockResolvedValue([]);
    ownerLoadMocks.financialActivity.mockResolvedValue([]);
    ownerLoadMocks.renameRequests.mockResolvedValue([]);
    ownerLoadMocks.deleteRequests.mockResolvedValue([]);
    ownerLoadMocks.ownerConnected.mockResolvedValue(new Map());
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

  it("starts all ownership reads before the main data wave settles", async () => {
    const dashboard = deferred<{ marker: string }>();
    const ownershipMembers = deferred<never[]>();
    ownerLoadMocks.dashboard.mockReturnValue(dashboard.promise);
    ownerLoadMocks.ownershipMembers.mockReturnValue(ownershipMembers.promise);

    const loading = loadOwnerPageData({
      searchParams: { section: "ownership" },
      userEmail: "owner@example.test",
      userId: "user-1"
    });

    await vi.waitFor(() => {
      expect(ownerLoadMocks.ownershipMembers).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.llcInvitations).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.distributionHistory).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.pendingChanges).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.pendingWithdrawals).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.financialActivity).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.renameRequests).toHaveBeenCalledOnce();
      expect(ownerLoadMocks.deleteRequests).toHaveBeenCalledOnce();
    });

    dashboard.resolve({ marker: "dashboard" });
    ownershipMembers.resolve([]);
    const result = await loading;
    expect(result.status).toBe("ready");
  });

  it("starts the owner-connected map when portfolio resolves without waiting for the main wave", async () => {
    const dashboard = deferred<{ marker: string }>();
    const portfolio = deferred<{ properties: Array<{ id: string }>; units: never[]; leases: never[]; tenants: never[] }>();
    ownerLoadMocks.dashboard.mockReturnValue(dashboard.promise);
    ownerLoadMocks.portfolio.mockReturnValue(portfolio.promise);

    const loading = loadOwnerPageData({
      searchParams: { section: "charges" },
      userEmail: "owner@example.test",
      userId: "user-1"
    });
    portfolio.resolve({ properties: [{ id: "property-1" }], units: [], leases: [], tenants: [] });

    await vi.waitFor(() => {
      expect(ownerLoadMocks.ownerConnected).toHaveBeenCalledWith(["property-1"]);
    });
    expect(ownerLoadMocks.dashboard).toHaveBeenCalledOnce();

    dashboard.resolve({ marker: "dashboard" });
    const result = await loading;
    expect(result).toEqual({
      status: "ready",
      activeAccountId: "account-1",
      analytics: undefined,
      announcementProperties: [],
      applications: undefined,
      applicationCount: undefined,
      approvedApplicationCount: undefined,
      auditLogs: undefined,
      automationRules: undefined,
      automationTemplates: undefined,
      capabilities: expect.objectContaining({
        ownerSectionAvailability: {
          hasActivitySection: true,
          hasAnalyticsSection: false,
          hasApplicationsSection: true,
          hasAutomationsSection: true,
          hasDocumentsSection: true,
          hasExpensesSection: true,
          hasInboxSection: true,
          hasInvitationsSection: true,
          hasLeasingSection: true,
          hasManagerPaymentsSection: false,
          hasMembersSection: true,
          hasNotificationsSection: true,
          hasOwnershipSection: true,
          hasVendorsSection: true
        }
      }),
      dashboard: { marker: "dashboard" },
      distributionHistory: undefined,
      documents: undefined,
      expenses: undefined,
      financialActivityFeed: undefined,
      generatedMessage: null,
      inboxThreads: undefined,
      initialOwnerHomePage: false,
      initialOwnerWorkflowMode: undefined,
      initialPropertyId: null,
      initialSectionId: "charges",
      invitations: undefined,
      isEmpty: false,
      listings: undefined,
      loadedBundles: [
        "dashboard",
        "portfolio",
        "announcement-properties",
        "notifications",
        "notification-preferences",
        "rent-collection-status",
        "owner-connected-map"
      ],
      managerPaymentsData: undefined,
      newFeedbackCount: undefined,
      notificationPreferenceSettings: null,
      notifications: [],
      ownerConnectedMap: new Map(),
      ownershipAccounts: [{ id: "account-1", accountType: "llc" }],
      ownershipMembers: undefined,
      pendingAccountDeleteRequests: undefined,
      pendingAccountRenameRequests: undefined,
      pendingChangeRequests: undefined,
      pendingLlcInvitations: undefined,
      pendingWithdrawals: undefined,
      portfolio: { properties: [{ id: "property-1" }], units: [], leases: [], tenants: [] },
      profile: { onboardingCompletedAt: "2026-01-01" },
      rentCollectionStatus: { marker: "rent-status" },
      rentIncreaseHistory: undefined,
      role: "owner",
      tickets: undefined,
      vendors: undefined
    });
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
