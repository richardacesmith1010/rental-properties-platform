import { ownerMenuGroups } from "@/components/dashboard/dashboard-config";
import { getDashboardData } from "@/lib/dashboard";
import { getPortfolioData } from "@/lib/portfolio";
import { getAdministeredPropertyIdsForAccount, getAdministeredPropertyOptions } from "@/lib/property-access";
import { getRentCollectionConnectStatus } from "@/lib/stripe-connect";
import { getNotificationsForUser } from "@/lib/notifications";
import { getUserNotificationPreferenceSettings } from "@/lib/notification-preferences";
import { getFeatureCapabilities } from "@/lib/feature-capabilities";
import { getOwnershipAccountsForUser } from "@/lib/ownership";
import { getCurrentUserRole, getUserProfileSummary } from "@/lib/auth";
import { logPerfEvent, measurePerf } from "@/lib/logger";
import type { DashboardCapabilities } from "@/components/dashboard/types";
import type { OwnerPageLoadResult, OwnerPageReadyData, OwnerPageSearchParams, ResolvedOwnerRequest } from "./page-data/types";
import { resolveOwnerPageRequest } from "./page-data/request";
import { buildOwnerBundlePlan, buildOwnerSectionAvailability } from "./page-data/bundle-plan";
import { loadOwnerSectionBundles, hasOwnerManagerPaymentSection } from "./page-data/section-bundles";
import type { OwnerBundleId } from "./page-data/types";
export type {
  OwnerBundleId, OwnerPageSearchParams, ResolvedOwnerRequest, OwnerPageLoadResult,
  OwnerPageReadyData, OwnerPageNeedsOnboarding, OwnerPageNeedsSetup, OwnerPageRoleMismatch
} from "./page-data/types";
export { resolveOwnerPageRequest, buildOwnerBundlePlan, buildOwnerSectionAvailability, loadOwnerSectionBundles } from "./page-data";

function buildOwnerPerfMeta(request: ResolvedOwnerRequest) {
  return {
    route: "/owner",
    activeAccountId: request.activeAccountId ?? "none",
    requestedMode: request.requestedMode ?? "daily_ops",
    requestedPropertyId: request.requestedPropertyId ?? "all",
    requestedSection: request.requestedSectionId ?? "home"
  };
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

  const profilePromise = measureOwner("profile.summary", () => getUserProfileSummary(params.userId), {
    userId: params.userId
  });
  const ownershipAccountsPromise = measureOwner("ownership.accounts", () => getOwnershipAccountsForUser(params.userId), {
    userId: params.userId
  });
  const capabilitiesPromise = measureOwner("feature.capabilities", () => getFeatureCapabilities());
  const [profile, ownershipAccounts] = await Promise.all([profilePromise, ownershipAccountsPromise]);
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
    await capabilitiesPromise;
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
    await capabilitiesPromise;
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

  const activeAccount = ownershipAccounts.find((account) => account.id === request.activeAccountId);
  const isLlcAccount = activeAccount?.accountType === "llc";
  const administeredPropertyIdsPromise = request.activeAccountId
    ? measureOwnerWithRequest(
        "properties.administered-ids",
        () => getAdministeredPropertyIdsForAccount(params.userId, request.activeAccountId!),
        { activeAccountId: request.activeAccountId }
      )
    : Promise.resolve([] as string[]);
  const managerPaymentsVisibilityPromise = administeredPropertyIdsPromise.then((propertyIds) =>
    measureOwnerWithRequest(
      "manager-payments.visibility",
      () => hasOwnerManagerPaymentSection(propertyIds),
      { propertyCount: propertyIds.length }
    )
  );
  const activeAccountId = request.activeAccountId;
  const dashboardPromise = administeredPropertyIdsPromise.then((propertyIds) =>
    measureOwnerWithRequest(
      "dashboard.data",
      () => getDashboardData(params.userId, activeAccountId, propertyIds, "owner")
    )
  );
  const portfolioPromise = administeredPropertyIdsPromise.then((propertyIds) =>
    measureOwnerWithRequest(
      "portfolio.data",
      () => getPortfolioData(params.userId, activeAccountId, propertyIds)
    )
  );
  const rentCollectionStatusPromise = measureOwnerWithRequest(
    "stripe-connect.status",
    () => getRentCollectionConnectStatus(params.userId)
  );
  void dashboardPromise.catch(() => undefined);
  void portfolioPromise.catch(() => undefined);
  void rentCollectionStatusPromise.catch(() => undefined);
  void managerPaymentsVisibilityPromise.catch(() => undefined);
  const capabilities = await capabilitiesPromise;

  const administeredPropertyIds = await administeredPropertyIdsPromise;
  if (!administeredPropertyIds.includes(request.requestedPropertyId ?? "")) {
    request.requestedPropertyId = null;
    request.initialPropertyId = null;
  }
  const provisionalAvailability = buildOwnerSectionAvailability({
    capabilities,
    hasManagedProperties: administeredPropertyIds.length > 0,
    hasManagerPaymentsSection: false,
    isLlcAccount
  });
  const provisionalBundlePlan = buildOwnerBundlePlan({
    capabilities,
    initialOwnerHomePage: request.initialOwnerHomePage,
    initialSectionId: request.initialSectionId,
    isLlcAccount,
    sectionAvailability: provisionalAvailability
  });
  const sectionDataPromise = loadOwnerSectionBundles({
    ...params, request, ownershipAccounts, capabilities, bundles: provisionalBundlePlan.bundles,
    connectedPropertyIds: request.initialOwnerHomePage
      ? Promise.resolve(administeredPropertyIds)
      : portfolioPromise.then((value) => value.properties.map((property) => property.id)),
    measure: measureOwnerWithRequest
  });
  void sectionDataPromise.catch(() => undefined);
  const hasManagerPaymentsSection = await managerPaymentsVisibilityPromise;
  const sectionAvailability = buildOwnerSectionAvailability({
    capabilities,
    hasManagedProperties: administeredPropertyIds.length > 0,
    hasManagerPaymentsSection,
    isLlcAccount
  });
  const bundlePlan = { ...provisionalBundlePlan, sectionAvailability };
  const hasBundle = (bundleId: OwnerBundleId) => bundlePlan.bundles.has(bundleId);
  const capabilitiesWithOwnerSectionAvailability: DashboardCapabilities = {
    ...capabilities,
    ownerSectionAvailability: bundlePlan.sectionAvailability
  };
  const [
    dashboard,
    portfolio,
    announcementProperties,
    notifications,
    notificationPreferenceSettings,
    rentCollectionStatus,
    sectionData
  ] = await Promise.all([
    dashboardPromise,
    portfolioPromise,
    hasBundle("announcement-properties")
      ? measureOwnerWithRequest("properties.admin-options", () => getAdministeredPropertyOptions(params.userId))
      : Promise.resolve(undefined),
    hasBundle("notifications") && capabilities.notificationsEnabled
      ? measureOwnerWithRequest("notifications.user", () => getNotificationsForUser(params.userId))
      : Promise.resolve(undefined),
    hasBundle("notification-preferences")
      ? measureOwnerWithRequest("notifications.preferences", () => getUserNotificationPreferenceSettings(params.userId))
      : Promise.resolve(undefined),
    rentCollectionStatusPromise,
    sectionDataPromise
  ]);

  const isEmpty = portfolio.properties.length === 0 &&
    !request.initialSectionId;

  finishOwnerPerfWithRequest({
    isLlcAccount,
    loadedBundles: Array.from(bundlePlan.bundles).join(","),
    propertyCount: portfolio.properties.length,
    status: "ready"
  });

  return {
    status: "ready",
    ...sectionData,
    activeAccountId: request.activeAccountId,
    announcementProperties,
    capabilities: capabilitiesWithOwnerSectionAvailability,
    dashboard,
    generatedMessage: request.generatedMessage,
    initialOwnerHomePage: request.initialOwnerHomePage,
    initialOwnerWorkflowMode: request.initialOwnerWorkflowMode,
    initialPropertyId: request.initialPropertyId,
    initialSectionId: request.initialSectionId,
    isEmpty,
    loadedBundles: Array.from(bundlePlan.bundles),
    notificationPreferenceSettings,
    notifications,
    ownershipAccounts,
    portfolio,
    profile,
    rentCollectionStatus,
    role
  };
}

export const OWNER_SECTION_IDS = ["daily-ops-home", "operations", ...ownerMenuGroups.flatMap(group => group.items.map(([id]) => id))];
export const OWNER_SHARED_BUNDLES: OwnerBundleId[] = [
  "dashboard", "portfolio", "announcement-properties", "notifications",
  "notification-preferences", "rent-collection-status"
];

export function getOwnerSectionBundleRequirements(data: OwnerPageReadyData) {
  return Object.fromEntries(OWNER_SECTION_IDS.map(section => [section,
    Array.from(buildOwnerBundlePlan({
      capabilities: data.capabilities,
      initialOwnerHomePage: section === "daily-ops-home" || section === "overview",
      initialSectionId: section,
      isLlcAccount: data.ownershipAccounts.find(account => account.id === data.activeAccountId)?.accountType === "llc",
      sectionAvailability: data.capabilities.ownerSectionAvailability!
    }).bundles).filter(bundle => !OWNER_SHARED_BUNDLES.includes(bundle))
  ]));
}
