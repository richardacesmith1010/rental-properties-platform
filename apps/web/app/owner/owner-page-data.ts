import { getGeneratedMessage } from "@/lib/format";
import { getDashboardData, type DashboardData } from "@/lib/dashboard";
import { getNewFeedbackCountForOwner } from "@/lib/feedback";
import { getUserNotificationPreferenceSettings, type NotificationPreferenceSettings } from "@/lib/notification-preferences";
import { getPortfolioData, type PortfolioData } from "@/lib/portfolio";
import { getAdministeredPropertyOptions } from "@/lib/property-access";
import { getAdminMaintenanceTickets, type MaintenanceTicket } from "@/lib/maintenance";
import { getOwnerInvitations, type InvitationListItem } from "@/lib/invitations";
import { getOwnerDocumentsData, type OwnerDocumentsData } from "@/lib/documents";
import { getNotificationsForUser, type NotificationDTO } from "@/lib/notifications";
import { getAutomationRulesForUser, getAutomationTemplates, type AutomationRuleDTO, type AutomationTemplateDTO } from "@/lib/automations";
import { getInboxThreadsForUser, type InboxThreadDTO } from "@/lib/inbox";
import { getRentalListingsForUser, type RentalListingDTO } from "@/lib/leasing";
import { getApplicationsForUser, type ApplicationDTO } from "@/lib/applications";
import { getOwnerVendors, type VendorDTO } from "@/lib/vendors";
import { getFeatureCapabilities, type FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import {
  getOwnershipAccountsForUser,
  getOwnershipMembersForAccount,
  getPendingAccountDeleteRequests,
  getPendingAccountRenameRequests,
  type AccountDeleteRequestDTO,
  type AccountRenameRequestDTO,
  type ActiveLlcMembershipDTO,
  type OwnershipAccountDTO,
  type OwnershipMemberDTO
} from "@/lib/ownership";
import { getPendingLLCInvitationsForAccount, type LLCInvitationDTO } from "@/lib/llc-invitations";
import { getOwnerExpenseData, type ExpenseDashboardData } from "@/lib/expenses";
import { getUserGamification, type UserGamificationData } from "@/lib/gamification";
import { getOwnerAnalyticsData, type AnalyticsDashboardData } from "@/lib/analytics";
import { getRecentAuditLogs, type AuditLogEntry } from "@/lib/audit";
import { getRentIncreaseHistory, type RentIncreaseEntry } from "@/lib/rent-increases";
import { getDistributionHistory, getFinancialActivityFeed, type DistributionHistoryEntry, type FinancialActivityEvent } from "@/lib/distributions";
import { getPendingChangeRequests, type DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import { getPendingWithdrawals, type WithdrawalRequestDTO } from "@/lib/withdrawals";
import {
  arePropertyOwnersConnected,
  getRentCollectionConnectStatus,
  type RentCollectionConnectStatus
} from "@/lib/stripe-connect";
import { getManagerPaymentsDashboardData } from "@/lib/manager-payments-data";
import {
  getCurrentUserRole,
  getUserProfileSummary,
  type AppRole,
  type UserProfileSummary
} from "@/lib/auth";
import { logPerfEvent, measurePerf } from "@/lib/logger";

type OwnerWorkflowMode = "daily_ops" | "new_property" | "new_tenant" | "new_manager" | "records";
export type OwnerBundleId =
  | "analytics"
  | "announcement-properties"
  | "applications"
  | "audit-logs"
  | "automations"
  | "dashboard"
  | "documents"
  | "expenses"
  | "feedback"
  | "gamification"
  | "inbox"
  | "invitations"
  | "manager-payments"
  | "notification-preferences"
  | "notifications"
  | "owner-connected-map"
  | "ownership-governance"
  | "ownership-members"
  | "portfolio"
  | "rent-collection-status"
  | "rent-increases"
  | "tickets"
  | "vendors"
  | "listings";

export interface OwnerPageSearchParams {
  generated?: string | string[];
  section?: string | string[];
  mode?: string | string[];
  account?: string | string[];
  property?: string | string[];
}

interface ResolvedOwnerRequest {
  accountParam: string | null;
  activeAccountId: string | null;
  generatedMessage: string | null;
  hasExplicitSection: boolean;
  initialOwnerHomePage: boolean;
  initialOwnerWorkflowMode?: OwnerWorkflowMode;
  initialPropertyId: string | null;
  initialSectionId: string | null;
  requestedMode: string | null;
  requestedPropertyId: string | null;
  requestedSectionId: string | null;
}

interface OwnerPageResolvedBase {
  generatedMessage: string | null;
  initialOwnerHomePage: boolean;
  initialOwnerWorkflowMode?: OwnerWorkflowMode;
  initialPropertyId: string | null;
  initialSectionId: string | null;
  profile: UserProfileSummary;
  role: AppRole;
}

export interface OwnerPageNeedsOnboarding extends OwnerPageResolvedBase {
  status: "needs-onboarding";
  ownershipAccounts: OwnershipAccountDTO[];
}

export interface OwnerPageNeedsSetup extends OwnerPageResolvedBase {
  status: "needs-setup";
  ownershipAccounts: OwnershipAccountDTO[];
}

export interface OwnerPageRoleMismatch {
  status: "role-mismatch";
  role: AppRole;
}

export interface OwnerPageReadyData extends OwnerPageResolvedBase {
  status: "ready";
  activeAccountId: string | null;
  analytics?: AnalyticsDashboardData;
  announcementProperties?: Awaited<ReturnType<typeof getAdministeredPropertyOptions>>;
  applications?: ApplicationDTO[];
  applicationCount?: number;
  approvedApplicationCount?: number;
  auditLogs?: AuditLogEntry[];
  automationRules?: AutomationRuleDTO[];
  automationTemplates?: AutomationTemplateDTO[];
  capabilities: FeatureCapabilitiesDTO;
  dashboard: DashboardData;
  distributionHistory?: DistributionHistoryEntry[];
  documents?: OwnerDocumentsData;
  expenses?: ExpenseDashboardData;
  financialActivityFeed?: FinancialActivityEvent[];
  gamification?: UserGamificationData;
  inboxThreads?: InboxThreadDTO[];
  invitations?: InvitationListItem[];
  isEmpty: boolean;
  listings?: RentalListingDTO[];
  loadedBundles: OwnerBundleId[];
  llcPayoutMemberships?: ActiveLlcMembershipDTO[];
  managerPaymentsData?: Awaited<ReturnType<typeof getManagerPaymentsDashboardData>>;
  newFeedbackCount?: number;
  notificationPreferenceSettings?: NotificationPreferenceSettings | null;
  notifications?: NotificationDTO[];
  ownerConnectedMap?: Map<string, boolean>;
  ownershipAccounts: OwnershipAccountDTO[];
  ownershipMembers?: OwnershipMemberDTO[];
  pendingAccountDeleteRequests?: AccountDeleteRequestDTO[];
  pendingAccountRenameRequests?: AccountRenameRequestDTO[];
  pendingChangeRequests?: DistributionChangeRequestDTO[];
  pendingLlcInvitations?: LLCInvitationDTO[];
  pendingWithdrawals?: WithdrawalRequestDTO[];
  portfolio: PortfolioData;
  rentCollectionStatus: RentCollectionConnectStatus;
  rentIncreaseHistory?: RentIncreaseEntry[];
  tickets?: MaintenanceTicket[];
  vendors?: VendorDTO[];
}

export type OwnerPageLoadResult =
  | OwnerPageNeedsOnboarding
  | OwnerPageNeedsSetup
  | OwnerPageReadyData
  | OwnerPageRoleMismatch;

function getSingleSearchParam(
  value: string | string[] | undefined
) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

export function resolveOwnerPageRequest(
  searchParams: OwnerPageSearchParams | undefined,
  ownershipAccounts: OwnershipAccountDTO[]
): ResolvedOwnerRequest {
  const requestedMode = getSingleSearchParam(searchParams?.mode);
  const requestedSectionId = getSingleSearchParam(searchParams?.section);
  const requestedPropertyId = getSingleSearchParam(searchParams?.property);
  const accountParam = getSingleSearchParam(searchParams?.account);
  const activeAccountId = ownershipAccounts.some((account) => account.id === accountParam)
    ? accountParam!
    : ownershipAccounts[0]?.id ?? null;
  const initialOwnerWorkflowMode =
    requestedMode === "daily_ops" ||
    requestedMode === "new_property" ||
    requestedMode === "new_tenant" ||
    requestedMode === "new_manager" ||
    requestedMode === "records"
      ? requestedMode
      : undefined;

  return {
    accountParam,
    activeAccountId,
    generatedMessage: getGeneratedMessage(searchParams?.generated),
    hasExplicitSection: requestedSectionId !== null,
    initialOwnerHomePage:
      initialOwnerWorkflowMode !== "records" &&
      initialOwnerWorkflowMode !== "new_manager" &&
      initialOwnerWorkflowMode !== "new_property" &&
      initialOwnerWorkflowMode !== "new_tenant" &&
      requestedSectionId === null,
    initialOwnerWorkflowMode,
    initialPropertyId: requestedPropertyId,
    initialSectionId: requestedSectionId,
    requestedMode,
    requestedPropertyId,
    requestedSectionId
  };
}

function buildOwnerPerfMeta(request: ResolvedOwnerRequest) {
  return {
    route: "/owner",
    activeAccountId: request.activeAccountId ?? "none",
    requestedMode: request.requestedMode ?? "daily_ops",
    requestedPropertyId: request.requestedPropertyId ?? "all",
    requestedSection: request.requestedSectionId ?? "home"
  };
}

export function buildOwnerBundlePlan(params: {
  capabilities: FeatureCapabilitiesDTO;
  initialOwnerHomePage: boolean;
  initialSectionId: string | null;
  isLlcAccount: boolean;
}): Set<OwnerBundleId> {
  const bundles = new Set<OwnerBundleId>([
    "dashboard",
    "portfolio",
    "announcement-properties",
    "notifications",
    "notification-preferences",
    "rent-collection-status",
    "gamification"
  ]);

  if (params.initialOwnerHomePage) {
    bundles.add("tickets");
    bundles.add("expenses");
    bundles.add("manager-payments");
    bundles.add("feedback");

    if (params.isLlcAccount) {
      bundles.add("ownership-members");
    }

    return bundles;
  }

  switch (params.initialSectionId) {
    case "overview":
      bundles.add("tickets");
      break;
    case "charges":
      bundles.add("owner-connected-map");
      break;
    case "maintenance":
      bundles.add("tickets");
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      break;
    case "leasing":
      bundles.add("invitations");
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      if (params.capabilities.leasingPipelineEnabled) {
        bundles.add("listings");
      }
      break;
    case "applications":
      if (params.capabilities.leasingPipelineEnabled) {
        bundles.add("applications");
        bundles.add("listings");
      }
      break;
    case "inbox":
      if (params.capabilities.inboxThreadsEnabled) {
        bundles.add("inbox");
      }
      break;
    case "automations":
      if (params.capabilities.automationsEnabled) {
        bundles.add("automations");
      }
      break;
    case "activity":
      bundles.add("audit-logs");
      break;
    case "ownership":
      bundles.add("ownership-members");
      bundles.add("ownership-governance");
      break;
    case "members":
      bundles.add("ownership-members");
      break;
    case "invitations":
      bundles.add("invitations");
      break;
    case "documents":
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      break;
    case "vendors":
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      break;
    case "expenses":
      bundles.add("expenses");
      if (params.capabilities.vendorWorkflowEnabled) {
        bundles.add("vendors");
      }
      if (params.capabilities.documentsEnabled) {
        bundles.add("documents");
      }
      break;
    case "analytics":
      bundles.add("analytics");
      break;
    case "leases":
      bundles.add("rent-increases");
      break;
    case "manager-payments":
      bundles.add("manager-payments");
      break;
    default:
      break;
  }

  return bundles;
}

export async function loadOwnerPageData(params: {
  searchParams?: OwnerPageSearchParams;
  userEmail: string;
  userId: string;
}): Promise<OwnerPageLoadResult> {
  const ownerPerfStartedAt = performance.now();
  const provisionalRequest = resolveOwnerPageRequest(params.searchParams, []);
  const basePerfMeta = {
    route: "/owner",
    activeAccountId: "none",
    requestedMode: provisionalRequest.requestedMode ?? "daily_ops",
    requestedPropertyId: provisionalRequest.requestedPropertyId ?? "all",
    requestedSection: provisionalRequest.requestedSectionId ?? "home"
  };
  const measureOwner = <T,>(
    name: string,
    work: () => Promise<T>,
    meta?: Record<string, unknown>
  ) => measurePerf("owner", name, work, { ...basePerfMeta, ...meta });
  const finishOwnerPerf = (meta?: Record<string, unknown>) =>
    logPerfEvent({
      scope: "owner",
      name: "data-assembly.total",
      durationMs: performance.now() - ownerPerfStartedAt,
      meta: {
        ...basePerfMeta,
        userId: params.userId,
        ...(meta ?? {})
      }
    });

  const role = await measureOwner("auth.role", () => getCurrentUserRole(params.userId), {
    userId: params.userId
  });
  if (role !== "owner") {
    finishOwnerPerf({ status: "role-mismatch", role });
    return {
      status: "role-mismatch",
      role
    };
  }

  const profile = await measureOwner("profile.summary", () => getUserProfileSummary(params.userId), {
    userId: params.userId
  });
  const ownershipAccounts = await measureOwner(
    "ownership.accounts",
    () => getOwnershipAccountsForUser(params.userId),
    {
      userId: params.userId
    }
  );
  const request = resolveOwnerPageRequest(params.searchParams, ownershipAccounts);
  const ownerPerfMeta = buildOwnerPerfMeta(request);
  const measureOwnerWithRequest = <T,>(
    name: string,
    work: () => Promise<T>,
    meta?: Record<string, unknown>
  ) => measurePerf("owner", name, work, { ...ownerPerfMeta, userId: params.userId, ...(meta ?? {}) });
  const finishOwnerPerfWithRequest = (meta?: Record<string, unknown>) =>
    logPerfEvent({
      scope: "owner",
      name: "data-assembly.total",
      durationMs: performance.now() - ownerPerfStartedAt,
      meta: {
        ...ownerPerfMeta,
        userId: params.userId,
        ownershipAccountCount: ownershipAccounts.length,
        ...(meta ?? {})
      }
    });

  if (!profile.onboardingCompletedAt) {
    finishOwnerPerfWithRequest({ status: "needs-onboarding" });
    return {
      status: "needs-onboarding",
      generatedMessage: request.generatedMessage,
      initialOwnerHomePage: request.initialOwnerHomePage,
      initialOwnerWorkflowMode: request.initialOwnerWorkflowMode,
      initialPropertyId: request.initialPropertyId,
      initialSectionId: request.initialSectionId,
      ownershipAccounts,
      profile,
      role
    };
  }

  if (ownershipAccounts.length === 0) {
    finishOwnerPerfWithRequest({ status: "needs-setup" });
    return {
      status: "needs-setup",
      generatedMessage: request.generatedMessage,
      initialOwnerHomePage: request.initialOwnerHomePage,
      initialOwnerWorkflowMode: request.initialOwnerWorkflowMode,
      initialPropertyId: request.initialPropertyId,
      initialSectionId: request.initialSectionId,
      ownershipAccounts,
      profile,
      role
    };
  }

  const capabilities = await measureOwnerWithRequest(
    "feature.capabilities",
    () => getFeatureCapabilities()
  );
  const activeAccount = ownershipAccounts.find((account) => account.id === request.activeAccountId);
  const isLlcAccount = activeAccount?.accountType === "llc";
  const bundlePlan = buildOwnerBundlePlan({
    capabilities,
    initialOwnerHomePage: request.initialOwnerHomePage,
    initialSectionId: request.initialSectionId,
    isLlcAccount
  });
  const hasBundle = (bundleId: OwnerBundleId) => bundlePlan.has(bundleId);

  const [
    dashboard,
    portfolio,
    announcementProperties,
    tickets,
    invitations,
    documents,
    notifications,
    notificationPreferenceSettings,
    inboxThreads,
    automationTemplates,
    automationRules,
    listings,
    applications,
    vendors,
    expenses,
    managerPaymentsData,
    gamification,
    analytics,
    auditLogs,
    rentIncreaseHistory,
    newFeedbackCount,
    rentCollectionStatus
  ] = await Promise.all([
    measureOwnerWithRequest("dashboard.data", () => getDashboardData(params.userId, request.activeAccountId)),
    measureOwnerWithRequest("portfolio.data", () => getPortfolioData(params.userId, request.activeAccountId)),
    hasBundle("announcement-properties")
      ? measureOwnerWithRequest("properties.admin-options", () => getAdministeredPropertyOptions(params.userId))
      : Promise.resolve(undefined),
    hasBundle("tickets")
      ? measureOwnerWithRequest("maintenance.admin-tickets", () => getAdminMaintenanceTickets(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("invitations")
      ? measureOwnerWithRequest("invitations.owner", () => getOwnerInvitations(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("documents")
      ? capabilities.documentsEnabled
        ? measureOwnerWithRequest("documents.owner", () => getOwnerDocumentsData(params.userId, request.activeAccountId))
        : Promise.resolve({
            templates: [],
            packets: [],
            propertyFiles: [],
            propertyFilesEnabled: false,
            propertyFilesWarning: "Property file vault is not enabled yet."
          })
      : Promise.resolve(undefined),
    hasBundle("notifications") && capabilities.notificationsEnabled
      ? measureOwnerWithRequest("notifications.user", () => getNotificationsForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("notification-preferences")
      ? measureOwnerWithRequest("notifications.preferences", () => getUserNotificationPreferenceSettings(params.userId))
      : Promise.resolve(undefined),
    hasBundle("inbox") && capabilities.inboxThreadsEnabled
      ? measureOwnerWithRequest("inbox.threads", () => getInboxThreadsForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("automations") && capabilities.automationsEnabled
      ? measureOwnerWithRequest("automations.templates", () => getAutomationTemplates())
      : Promise.resolve(undefined),
    hasBundle("automations") && capabilities.automationsEnabled
      ? measureOwnerWithRequest("automations.rules", () => getAutomationRulesForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("listings") && capabilities.leasingPipelineEnabled
      ? measureOwnerWithRequest("leasing.listings", () => getRentalListingsForUser(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("applications") && capabilities.leasingPipelineEnabled
      ? measureOwnerWithRequest("applications.user", () => getApplicationsForUser(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("vendors") && capabilities.vendorWorkflowEnabled
      ? measureOwnerWithRequest("vendors.owner", () => getOwnerVendors(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("expenses")
      ? measureOwnerWithRequest("expenses.owner", () => getOwnerExpenseData(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("manager-payments")
      ? measureOwnerWithRequest(
          "manager-payments.dashboard",
          () => getManagerPaymentsDashboardData(params.userId, request.activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("gamification")
      ? measureOwnerWithRequest("gamification.user", () => getUserGamification(params.userId))
      : Promise.resolve(undefined),
    hasBundle("analytics")
      ? measureOwnerWithRequest("analytics.owner", () => getOwnerAnalyticsData(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("audit-logs")
      ? measureOwnerWithRequest("audit.recent", () => getRecentAuditLogs(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("rent-increases")
      ? measureOwnerWithRequest("rent-increases.history", () => getRentIncreaseHistory(params.userId, request.activeAccountId))
      : Promise.resolve(undefined),
    hasBundle("feedback")
      ? measureOwnerWithRequest("feedback.new-count", () => getNewFeedbackCountForOwner(params.userEmail), {
          userEmail: params.userEmail
        })
      : Promise.resolve(undefined),
    measureOwnerWithRequest("stripe-connect.status", () => getRentCollectionConnectStatus(params.userId))
  ]);

  const approvedApplicationCount = applications?.filter(
    (application) => application.status === "approved"
  ).length;
  const activeAccountId = request.activeAccountId;
  const [
    ownershipMembers,
    pendingLlcInvitations,
    distributionHistory,
    pendingChangeRequests,
    pendingWithdrawals,
    financialActivityFeed,
    pendingAccountRenameRequests,
    pendingAccountDeleteRequests
  ] = await Promise.all([
    hasBundle("ownership-members") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.members",
          () => getOwnershipMembersForAccount(params.userId, activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-members") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-llc-invitations",
          () => getPendingLLCInvitationsForAccount(params.userId, activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.distribution-history",
          () => getDistributionHistory(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-change-requests",
          () => getPendingChangeRequests(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.pending-withdrawals",
          () => getPendingWithdrawals(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance") && isLlcAccount && activeAccountId
      ? measureOwnerWithRequest(
          "ownership.financial-activity",
          () => getFinancialActivityFeed(activeAccountId)
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance")
      ? measureOwnerWithRequest(
          "ownership.pending-rename-requests",
          () => getPendingAccountRenameRequests(ownershipAccounts.map((account) => account.id)),
          {
            ownershipAccountCount: ownershipAccounts.length
          }
        )
      : Promise.resolve(undefined),
    hasBundle("ownership-governance")
      ? measureOwnerWithRequest(
          "ownership.pending-delete-requests",
          () => getPendingAccountDeleteRequests(ownershipAccounts.map((account) => account.id)),
          {
            ownershipAccountCount: ownershipAccounts.length
          }
        )
      : Promise.resolve(undefined)
  ]);
  const ownerConnectedMap = hasBundle("owner-connected-map")
    ? await measureOwnerWithRequest(
        "stripe-connect.owner-map",
        () => arePropertyOwnersConnected(portfolio.properties.map((property) => property.id)),
        {
          propertyCount: portfolio.properties.length
        }
      )
    : undefined;
  const isEmpty = portfolio.properties.length === 0 &&
    !request.initialOwnerWorkflowMode &&
    !request.initialSectionId;

  finishOwnerPerfWithRequest({
    isLlcAccount,
    loadedBundles: Array.from(bundlePlan).join(","),
    propertyCount: portfolio.properties.length,
    status: "ready"
  });

  return {
    status: "ready",
    activeAccountId: request.activeAccountId,
    analytics,
    announcementProperties,
    applications,
    applicationCount: applications?.length,
    approvedApplicationCount,
    auditLogs,
    automationRules,
    automationTemplates,
    capabilities,
    dashboard,
    distributionHistory,
    documents,
    expenses,
    financialActivityFeed,
    gamification,
    generatedMessage: request.generatedMessage,
    inboxThreads,
    initialOwnerHomePage: request.initialOwnerHomePage,
    initialOwnerWorkflowMode: request.initialOwnerWorkflowMode,
    initialPropertyId: request.initialPropertyId,
    initialSectionId: request.initialSectionId,
    invitations,
    isEmpty,
    listings,
    loadedBundles: Array.from(bundlePlan),
    managerPaymentsData,
    newFeedbackCount,
    notificationPreferenceSettings,
    notifications,
    ownerConnectedMap,
    ownershipAccounts,
    ownershipMembers,
    pendingAccountDeleteRequests,
    pendingAccountRenameRequests,
    pendingChangeRequests,
    pendingLlcInvitations,
    pendingWithdrawals,
    portfolio,
    profile,
    rentCollectionStatus,
    rentIncreaseHistory,
    role,
    tickets,
    vendors
  };
}
