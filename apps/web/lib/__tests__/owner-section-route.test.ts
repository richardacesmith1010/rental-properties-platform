// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerLoadMocks = vi.hoisted(() => ({
  invitations: vi.fn(), inbox: vi.fn(), templates: vi.fn(), rules: vi.fn(),
  listings: vi.fn(), applications: vi.fn(), expenses: vi.fn(), analytics: vi.fn(),
  audit: vi.fn(), rentIncreases: vi.fn(), feedback: vi.fn(),
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

vi.mock("@/lib/invitations", () => ({ getOwnerInvitations: ownerLoadMocks.invitations }));
vi.mock("@/lib/inbox", () => ({ getInboxThreadsForUser: ownerLoadMocks.inbox }));
vi.mock("@/lib/automations", () => ({ getAutomationTemplates: ownerLoadMocks.templates, getAutomationRulesForUser: ownerLoadMocks.rules }));
vi.mock("@/lib/leasing", () => ({ getRentalListingsForUser: ownerLoadMocks.listings }));
vi.mock("@/lib/applications", () => ({ getApplicationsForUser: ownerLoadMocks.applications }));
vi.mock("@/lib/expenses", () => ({ getOwnerExpenseData: ownerLoadMocks.expenses }));
vi.mock("@/lib/analytics", () => ({ getOwnerAnalyticsData: ownerLoadMocks.analytics }));
vi.mock("@/lib/audit", () => ({ getRecentAuditLogs: ownerLoadMocks.audit }));
vi.mock("@/lib/rent-increases", () => ({ getRentIncreaseHistory: ownerLoadMocks.rentIncreases }));
vi.mock("@/lib/feedback", () => ({ getNewFeedbackCountForOwner: ownerLoadMocks.feedback }));
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
  loadOwnerPageData
} from "@/app/owner/owner-page-data";

vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/owner/section-data/route";
import { decodeOwnerSectionResult, type OwnerSectionInput } from "@/lib/owner-section-transport";
async function requestSectionData(input: OwnerSectionInput) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) query.set(key, value === true ? "1" : String(value));
  }
  const response = await GET(new Request(`http://localhost/api/owner/section-data?${query}`));
  return decodeOwnerSectionResult(await response.json());
}
import * as ownerPageModule from "@/app/owner/owner-page-data";

describe("owner section GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(ownerLoadMocks)) mock.mockResolvedValue([]);
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

  it("authenticates before validation, without data reads or redirects", async () => {
    ownerLoadMocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await requestSectionData({ section: "invalid" })).toEqual({ error: "Authentication required." });
    expect(ownerLoadMocks.role).not.toHaveBeenCalled();
    expect(ownerLoadMocks.profile).not.toHaveBeenCalled();
    expect(ownerLoadMocks.tickets).not.toHaveBeenCalled();
  });

  it("validates known section ids and rejects client identity before checking role", async () => {
    expect(await requestSectionData({ section: "unknown" })).toHaveProperty("error");
    expect(await requestSectionData({ section: "charges", userId: "foreign" } as never)).toHaveProperty("error");
    expect(ownerLoadMocks.role).not.toHaveBeenCalled();
  });

  it.each(["manager", "tenant"])("returns a typed role mismatch for %s before bundle reads", async role => {
    ownerLoadMocks.role.mockResolvedValue(role);
    expect(await requestSectionData({ section: "maintenance" })).toEqual({ status: "role-mismatch" });
    expect(ownerLoadMocks.profile).not.toHaveBeenCalled();
    expect(ownerLoadMocks.tickets).not.toHaveBeenCalled();
  });

  it("preserves onboarding and setup outcomes without bundle reads", async () => {
    ownerLoadMocks.profile.mockResolvedValue({ onboardingCompletedAt: null });
    expect(await requestSectionData({ section: "charges" })).toEqual({ status: "needs-onboarding" });
    ownerLoadMocks.profile.mockResolvedValue({ onboardingCompletedAt: "complete" });
    ownerLoadMocks.ownershipAccounts.mockResolvedValue([]);
    expect(await requestSectionData({ section: "charges" })).toEqual({ status: "needs-setup" });
    expect(ownerLoadMocks.administeredIds).not.toHaveBeenCalled();
    expect(ownerLoadMocks.ownerConnected).not.toHaveBeenCalled();
  });

  it("falls back from a foreign account and drops a foreign property before any loader", async () => {
    ownerLoadMocks.administeredIds.mockResolvedValue(["property-1"]);
    const helper = vi.spyOn(ownerPageModule, "loadOwnerSectionBundles");
    const result = await requestSectionData({ section: "charges", account: "foreign-account", property: "foreign-property" });
    expect(ownerLoadMocks.administeredIds).toHaveBeenCalledWith("user-1", "account-1");
    expect(ownerLoadMocks.ownerConnected).toHaveBeenCalledWith(["property-1"]);
    expect(helper).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({
      activeAccountId: "account-1", initialPropertyId: null, requestedPropertyId: null
    }) }));
    expect(JSON.stringify(result)).not.toContain("foreign");
    helper.mockRestore();
  });

  it("drops a foreign property with a valid account, without changing account-scoped loader arguments", async () => {
    ownerLoadMocks.administeredIds.mockResolvedValue(["property-1"]);
    const helper = vi.spyOn(ownerPageModule, "loadOwnerSectionBundles");
    const result = await requestSectionData({ section: "maintenance", account: "account-1", property: "foreign-property" });
    expect(helper).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({
      initialPropertyId: null, requestedPropertyId: null
    }) }));
    expect(ownerLoadMocks.tickets).toHaveBeenCalledWith("user-1", "account-1", ["property-1"]);
    expect(JSON.stringify(result)).not.toContain("foreign-property");
    helper.mockRestore();
  });

  it("returns section bundles only, never loading shared bundles", async () => {
    const result = await requestSectionData({ section: "maintenance" });
    expect(result).toEqual({ status: "ready", data: {
      tickets: [{ id: "ticket-1", propertyId: "property-1" }], vendors: [], loadedBundles: ["tickets", "vendors"]
    } });
    for (const mock of [ownerLoadMocks.dashboard, ownerLoadMocks.portfolio, ownerLoadMocks.administeredOptions,
      ownerLoadMocks.notifications, ownerLoadMocks.notificationPreferences, ownerLoadMocks.rentCollectionStatus]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("treats preload as perf metadata only without changing auth, scope, or data", async () => {
    ownerLoadMocks.administeredIds.mockResolvedValue(["property-1"]);
    const normal = await requestSectionData({ section: "maintenance", account: "account-1" });
    const normalCalls = {
      auth: ownerLoadMocks.getUser.mock.calls.length,
      role: ownerLoadMocks.role.mock.calls.length,
      scope: ownerLoadMocks.administeredIds.mock.calls.length
    };
    ownerLoadMocks.logPerf.mockClear();

    const preloaded = await requestSectionData({ section: "maintenance", account: "account-1", preload: true });

    expect(preloaded).toEqual(normal);
    expect(ownerLoadMocks.getUser).toHaveBeenCalledTimes(normalCalls.auth + 1);
    expect(ownerLoadMocks.role).toHaveBeenCalledTimes(normalCalls.role + 1);
    expect(ownerLoadMocks.administeredIds).toHaveBeenCalledTimes(normalCalls.scope + 1);
    expect(ownerLoadMocks.tickets).toHaveBeenLastCalledWith("user-1", "account-1", ["property-1"]);
    expect(ownerLoadMocks.logPerf).toHaveBeenCalledWith(expect.objectContaining({
      meta: { route: "owner-section-data-api", preload: true }
    }));
  });

  it.each(["documents", "vendors", "inbox", "automations", "applications"])("respects disabled capability gates for %s", async section => {
    ownerLoadMocks.capabilities.mockResolvedValue({ warnings: {} });
    expect(await requestSectionData({ section })).toEqual({ status: "ready", data: { loadedBundles: [] } });
    expect(ownerLoadMocks.documents).not.toHaveBeenCalled();
    expect(ownerLoadMocks.vendors).not.toHaveBeenCalled();
  });

  it.each(["ownership", "maintenance", "documents", "charges"])("page and GET share identical section data for %s", async section => {
    const response = await requestSectionData({ section });
    const page = await loadOwnerPageData({ searchParams: { section }, userId: "user-1", userEmail: "" });
    expect(response).toHaveProperty("status", "ready");
    expect(page.status).toBe("ready");
    if (!("status" in response) || response.status !== "ready" || page.status !== "ready") return;
    const { loadedBundles, ...data } = response.data;
    expect(page).toMatchObject(data);
    expect(page.loadedBundles).toEqual(expect.arrayContaining(loadedBundles));
  });

  it("returns a generic error when a loader fails", async () => {
    ownerLoadMocks.tickets.mockRejectedValueOnce(new Error("private database detail"));
    expect(await requestSectionData({ section: "maintenance" })).toEqual({ error: "Unable to load this section." });
  });


  it.each(["", "section=bad", "section=charges&userId=foreign", "section=charges&preload=0",
    "section=charges&section=maintenance", "section=charges&account=A&account=B",
    "section=charges&property=A&property=B", "section=charges&mode=A&mode=B",
    "section=charges&preload=1&preload=1", "section=charges&__proto__=x"
  ])("rejects invalid or duplicate query parameters before role reads: %s", async query => {
    const response = await GET(new Request(`http://localhost/api/owner/section-data?${query}`));
    expect(response.status).toBe(400);
    expect(ownerLoadMocks.role).not.toHaveBeenCalled();
  });

  it.each([200, 400, 401, 500])("sets private response headers for HTTP %s", async status => {
    if (status === 401) ownerLoadMocks.getUser.mockResolvedValue({ data: { user: null } });
    if (status === 500) ownerLoadMocks.role.mockRejectedValueOnce(new Error("secret SQL details"));
    const response = await GET(new Request(`http://localhost/api/owner/section-data?section=${status === 400 ? "bad" : "charges"}`));
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(await response.text()).not.toContain("secret SQL details");
    if (status === 401) {
      for (const [name, mock] of Object.entries(ownerLoadMocks)) {
        if (name !== "getUser") expect(mock).not.toHaveBeenCalled();
      }
    }
  });

  it("preserves every bundle's output and scopes every loader to session-owned fixtures", async () => {
    const accountScoped = ["invitations", "documents", "listings", "applications", "vendors", "expenses",
      "managerPayments", "analytics", "audit", "rentIncreases", "ownershipMembers", "llcInvitations"] as const;
    const userScoped = ["inbox", "rules"] as const;
    const governance = ["distributionHistory", "pendingChanges", "pendingWithdrawals", "financialActivity"] as const;
    // Fixtures deliberately return foreign-only data if any loader receives foreign scope.
    const fixture = (name: string) => [{ id: name, optional: undefined, nested: [undefined, null], amount: NaN }];
    for (const name of accountScoped) ownerLoadMocks[name].mockImplementation(async (user, account) =>
      user === "user-1" && account === "account-1" ? fixture(name) : [{ id: "foreign-only" }]);
    for (const name of userScoped) ownerLoadMocks[name].mockImplementation(async user =>
      user === "user-1" ? fixture(name) : [{ id: "foreign-only" }]);
    for (const name of governance) ownerLoadMocks[name].mockImplementation(async account =>
      account === "account-1" ? fixture(name) : [{ id: "foreign-only" }]);
    for (const name of ["renameRequests", "deleteRequests"] as const) {
      ownerLoadMocks[name].mockImplementation(async accounts =>
        JSON.stringify(accounts) === '["account-1"]' ? fixture(name) : [{ id: "foreign-only" }]);
    }
    ownerLoadMocks.tickets.mockImplementation(async (user, account, properties) =>
      user === "user-1" && account === "account-1" && JSON.stringify(properties) === '["property-1"]'
        ? fixture("tickets") : [{ id: "foreign-only" }]);
    ownerLoadMocks.administeredIds.mockResolvedValue(["property-1"]);
    ownerLoadMocks.ownerConnected.mockImplementation(async properties =>
      new Map([[properties[0], properties[0] === "property-1"]]));
    ownerLoadMocks.templates.mockResolvedValue(fixture("templates"));
    ownerLoadMocks.feedback.mockResolvedValue(3);
    const helper = vi.spyOn(ownerPageModule, "loadOwnerSectionBundles");
    const seen = new Set<string>();
    try {
      for (const section of ownerPageModule.OWNER_SECTION_IDS) {
        const result = await requestSectionData({ section, account: "foreign-account", property: "foreign-property" });
        expect(result).toHaveProperty("status", "ready");
        if (!("status" in result) || result.status !== "ready") throw new Error("Expected ready");
        const index = helper.mock.calls.length - 1;
        const call = helper.mock.calls[index][0];
        expect(call.userId).toBe("user-1");
        expect(call.userEmail).toBe("");
        expect(call.request.activeAccountId).toBe("account-1");
        expect(call.request.requestedPropertyId).toBeNull();
        expect(await call.connectedPropertyIds).toEqual(["property-1"]);
        const raw = await helper.mock.results[index].value;
        const expected = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
        expect(result.data).toStrictEqual({ ...expected, loadedBundles: [...call.bundles] });
        expect(JSON.stringify(result)).not.toContain("foreign-only");
        result.data.loadedBundles.forEach(bundle => seen.add(bundle));
      }
      expect([...seen].sort()).toEqual([
        "analytics", "applications", "audit-logs", "automations", "documents", "expenses", "feedback",
        "inbox", "invitations", "listings", "manager-payments", "owner-connected-map", "ownership-governance",
        "ownership-members", "rent-increases", "tickets", "vendors"
      ]);
      for (const name of accountScoped) expect(ownerLoadMocks[name]).toHaveBeenCalledWith("user-1", "account-1");
      for (const name of userScoped) expect(ownerLoadMocks[name]).toHaveBeenCalledWith("user-1");
      for (const name of governance) expect(ownerLoadMocks[name]).toHaveBeenCalledWith("account-1");
      expect(ownerLoadMocks.feedback).toHaveBeenCalledWith("");
      expect(ownerLoadMocks.templates).toHaveBeenCalledWith();
    } finally { helper.mockRestore(); }
  });
});
