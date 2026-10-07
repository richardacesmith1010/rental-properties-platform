// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerLoadMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  invitations: vi.fn(),
  expenses: vi.fn(),
  feedback: vi.fn(),
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
  logPerf: vi.fn(),
  adminFrom: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: ownerLoadMocks.getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: ownerLoadMocks.adminFrom }) }));
vi.mock("@/lib/maintenance", () => ({ getAdminMaintenanceTickets: ownerLoadMocks.tickets }));
vi.mock("@/lib/invitations", () => ({ getOwnerInvitations: ownerLoadMocks.invitations }));
vi.mock("@/lib/expenses", () => ({ getOwnerExpenseData: ownerLoadMocks.expenses }));
vi.mock("@/lib/feedback", () => ({ getNewFeedbackCountForOwner: ownerLoadMocks.feedback }));
vi.mock("@/lib/manager-payments-data", () => ({
  getManagerPaymentsDashboardData: ownerLoadMocks.managerPayments
}));
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
import {
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
    ownerLoadMocks.invitations.mockResolvedValue([]);
    ownerLoadMocks.expenses.mockResolvedValue({ properties: [], expenses: [] });
    ownerLoadMocks.feedback.mockResolvedValue(0);
    ownerLoadMocks.managerPayments.mockResolvedValue(null);
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
    const adminQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
      not: vi.fn()
    };
    adminQuery.select.mockReturnValue(adminQuery);
    adminQuery.in.mockReturnValue(adminQuery);
    adminQuery.eq.mockResolvedValue({ data: [], error: null });
    adminQuery.not.mockResolvedValue({ data: [], error: null });
    ownerLoadMocks.adminFrom.mockReturnValue(adminQuery);
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

  it("does not start Home-only loaders before portfolio resolves", async () => {
    const portfolio = deferred<{ properties: never[]; units: never[]; leases: never[]; tenants: never[] }>();
    ownerLoadMocks.portfolio.mockReturnValue(portfolio.promise);

    const loading = loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });

    await vi.waitFor(() => expect(ownerLoadMocks.dashboard).toHaveBeenCalled());
    expect(ownerLoadMocks.tickets).not.toHaveBeenCalled();
    expect(ownerLoadMocks.invitations).not.toHaveBeenCalled();
    expect(ownerLoadMocks.expenses).not.toHaveBeenCalled();
    expect(ownerLoadMocks.managerPayments).not.toHaveBeenCalled();
    expect(ownerLoadMocks.feedback).not.toHaveBeenCalled();
    portfolio.resolve({ properties: [], units: [], leases: [], tenants: [] });
    expect((await loading).status).toBe("ready");
  });

  it("starts always-loaded owner bundles before manager visibility resolves", async () => {
    const managerVisibility = deferred<{ data: Array<{ manager_profile_id: string }>; error: null }>();
    const adminQuery = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
      not: vi.fn()
    };
    adminQuery.select.mockReturnValue(adminQuery);
    adminQuery.in.mockReturnValue(adminQuery);
    adminQuery.eq.mockReturnValue(managerVisibility.promise);
    adminQuery.not.mockResolvedValue({ data: [{ id: "manager-1" }], error: null });
    ownerLoadMocks.adminFrom.mockReturnValue(adminQuery);
    ownerLoadMocks.administeredIds.mockResolvedValue(["property-1"]);
    ownerLoadMocks.administeredOptions.mockResolvedValue([{ id: "property-1", name: "Home" }]);
    ownerLoadMocks.notifications.mockResolvedValue([{ id: "notification-1" }]);
    ownerLoadMocks.notificationPreferences.mockResolvedValue({ emailEnabled: false });

    const loading = loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });
    await vi.waitFor(() => {
      expect(ownerLoadMocks.administeredOptions).toHaveBeenCalledWith("user-1");
      expect(ownerLoadMocks.notifications).toHaveBeenCalledWith("user-1");
      expect(ownerLoadMocks.notificationPreferences).toHaveBeenCalledWith("user-1");
    });

    managerVisibility.resolve({ data: [{ manager_profile_id: "manager-1" }], error: null });
    const result = await loading;
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.announcementProperties).toEqual([{ id: "property-1", name: "Home" }]);
      expect(result.notifications).toEqual([{ id: "notification-1" }]);
      expect(result.notificationPreferenceSettings).toEqual({ emailEnabled: false });
    }
  });

  it("does not start always-loaded owner bundles for needs-onboarding", async () => {
    ownerLoadMocks.profile.mockResolvedValue({ onboardingCompletedAt: null });
    const result = await loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });
    expect(result.status).toBe("needs-onboarding");
    expect(ownerLoadMocks.administeredOptions).not.toHaveBeenCalled();
    expect(ownerLoadMocks.notifications).not.toHaveBeenCalled();
    expect(ownerLoadMocks.notificationPreferences).not.toHaveBeenCalled();
  });

  it("does not start always-loaded owner bundles for needs-setup", async () => {
    ownerLoadMocks.ownershipAccounts.mockResolvedValue([]);
    const result = await loadOwnerPageData({ userEmail: "owner@example.test", userId: "user-1" });
    expect(result.status).toBe("needs-setup");
    expect(ownerLoadMocks.administeredOptions).not.toHaveBeenCalled();
    expect(ownerLoadMocks.notifications).not.toHaveBeenCalled();
    expect(ownerLoadMocks.notificationPreferences).not.toHaveBeenCalled();
  });
});

describe("resolveOwnerPageRequest", () => {
  it.each(["records", "new_tenant", "new_manager", "new_property"])("ignores legacy mode %s", mode => {
    const accounts = [{ id: "account-1" }] as never;
    expect(resolveOwnerPageRequest({ mode }, accounts).initialOwnerHomePage).toBe(true);
    const request = resolveOwnerPageRequest({ mode, section: "expenses" }, accounts);
    expect(request.initialOwnerHomePage).toBe(false);
    expect(request.initialSectionId).toBe("expenses");
    expect(request.initialOwnerWorkflowMode).toBeUndefined();
    expect(request.requestedMode).toBeNull();
  });
  it("treats the owner daily ops home as the default first paint", () => {
    const request = resolveOwnerPageRequest({}, [{ id: "account-1" }] as never);

    expect(request.activeAccountId).toBe("account-1");
    expect(request.initialOwnerHomePage).toBe(true);
    expect(request.initialOwnerWorkflowMode).toBeUndefined();
    expect(request.initialSectionId).toBeNull();
  });
});
