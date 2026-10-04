import type { OwnerBundleId } from "@/app/owner/owner-page-data";
import type { OwnerSectionData, OwnerSectionInput, OwnerSectionResult } from "@/app/actions/owner-section-data";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildAllSectionItems,
  getManagerModeNavItems,
  getOwnerModeNavItems,
  managerWorkflowModeMeta,
  ownerWorkflowModeMeta,
  type ManagerWorkflowMode,
  type OwnerWorkflowMode
} from "./dashboard-config";
import {
  MANAGER_SECTION_MODE_BY_ID,
  OWNER_SECTION_MODE_BY_ID
} from "./dashboard-workflow-modes";
import { useDashboardWorkflowHandlers } from "./dashboard-workflow-handlers";
import {
  OWNER_DAILY_OPS_SECTION_IDS,
  useOwnerDailyOpsPagination
} from "./owner-daily-ops-pagination";
import type { NavItem } from "./sidebar-nav";
import type { DashboardProps } from "./types";
import type { DashboardKpiState } from "./dashboard-kpi-loader";

export interface OwnerSectionCacheProps {
  loadedBundles: OwnerBundleId[];
  requirements: Record<string, OwnerBundleId[]>;
  account: string | null;
  mode?: string;
  property: string | null;
  loadSection: (input: OwnerSectionInput) => Promise<OwnerSectionResult>;
}

function resolveOwnerMode(mode: string | null): OwnerWorkflowMode {
  return mode && Object.prototype.hasOwnProperty.call(ownerWorkflowModeMeta, mode)
    ? mode as OwnerWorkflowMode : "daily_ops";
}

function ownerScope(account: string | null, mode: string | null, property: string | null) {
  return JSON.stringify([account, resolveOwnerMode(mode), property || null]);
}

export function useOwnerSectionCache(props: OwnerSectionCacheProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, redraw] = useState(0);
  const serverScope = ownerScope(props.account, props.mode ?? null, props.property);
  const scope = ownerScope(searchParams.get("account") ?? props.account,
    searchParams.get("mode"), searchParams.get("property"));
  const state = useRef({
    server: props.loadedBundles, scope, epoch: 0, request: 0, pendingUrl: null as string | null,
    overlay: new Map<OwnerBundleId, OwnerSectionData>(), loading: false, waitingForServer: false
  });
  const cache = state.current;
  // Render-time invalidation prevents even one frame of stale overlay after an RSC refresh.
  if (cache.server !== props.loadedBundles) {
    cache.server = props.loadedBundles;
    cache.scope = scope;
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = false;
    cache.waitingForServer = false;
    cache.pendingUrl = null;
  } else if (cache.scope !== scope && !cache.waitingForServer) {
    cache.scope = scope;
    cache.epoch++;
    cache.overlay.clear();
    cache.loading = true;
    cache.waitingForServer = true;
  }

  const invalidate = useCallback(() => {
    const current = state.current;
    current.epoch++;
    current.overlay.clear();
    current.loading = true;
    current.waitingForServer = true;
    current.pendingUrl = null;
    redraw(value => value + 1);
  }, []);
  const fullNavigate = useCallback((url: string) => {
    invalidate(); // Synchronous, before starting the server navigation.
    state.current.pendingUrl = url;
    router.replace(url);
  }, [invalidate, router]);

  useEffect(() => {
    const onPopState = () => {
      invalidate();
      router.refresh();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [invalidate, router]);

  const navigate = useCallback((url: string, section: string) => {
    const next = new URL(url, window.location.origin);
    const nextScope = ownerScope(next.searchParams.get("account") ?? props.account,
      next.searchParams.get("mode"), next.searchParams.get("property"));
    const current = state.current;
    if (current.waitingForServer || nextScope !== current.scope || nextScope !== serverScope) {
      fullNavigate(url);
      return;
    }
    window.history.replaceState(null, "", url);
    const request = ++current.request;
    const epoch = current.epoch;
    const required = props.requirements[section];
    const loaded = new Set([...props.loadedBundles, ...current.overlay.keys()]);
    if (required && required.every(bundle => loaded.has(bundle))) {
      current.loading = false;
      redraw(value => value + 1);
      return;
    }
    current.loading = true;
    redraw(value => value + 1);
    const isCurrent = () => state.current.request === request && state.current.epoch === epoch;
    void props.loadSection({
      section, account: next.searchParams.get("account") ?? props.account ?? undefined,
      mode: next.searchParams.get("mode") ?? undefined,
      property: next.searchParams.get("property") ?? undefined
    }).then(result => {
      if (!isCurrent()) return;
      if (!("status" in result) || result.status !== "ready") {
        invalidate();
        router.refresh(); // URL already changed: replace(sameUrl) may do nothing.
        return;
      }
      for (const bundle of result.data.loadedBundles) {
        current.overlay.delete(bundle);
        current.overlay.set(bundle, result.data);
      }
      current.loading = false;
      redraw(value => value + 1);
    }).catch(() => {
      if (!isCurrent()) return;
      invalidate();
      router.refresh();
    });
  }, [fullNavigate, invalidate, props, router, serverScope]);

  const navigationParams = () => new URL(
    state.current.pendingUrl ?? window.location.href, window.location.origin
  ).searchParams;
  const data: Partial<OwnerSectionData> = Object.assign({}, ...cache.overlay.values());
  return { data, loading: cache.loading, navigate, fullNavigate, navigationParams };
}

export const OwnerSectionCacheContext = createContext<ReturnType<typeof useOwnerSectionCache> | null>(null);

export function useDashboardNavigation(props: DashboardProps, kpis: DashboardKpiState) {
  const ownerCache = useContext(OwnerSectionCacheContext);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    chargeBadgeCount,
    hasActivitySection,
    hasAnalyticsSection,
    hasApplicationsSection,
    hasAutomationsSection,
    hasDocumentsSection,
    hasExpensesSection,
    hasInboxSection,
    hasInvitationsSection,
    hasLeasingSection,
    hasManagerPaymentsSection,
    hasMembersSection,
    hasNotificationsSection,
    hasOwnershipSection,
    hasVendorsSection,
    inboxBadgeCount,
    isManagerRole,
    isOwnerRole,
    maintenanceBadgeCount,
    notificationBadgeCount
  } = kpis;
  const ownerSectionAvailability = props.capabilities?.ownerSectionAvailability;
  const navigationAvailability = useMemo(
    () => ({
      hasActivitySection:
        isOwnerRole
          ? ownerSectionAvailability?.hasActivitySection ?? hasActivitySection
          : hasActivitySection,
      hasAnalyticsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasAnalyticsSection ?? hasAnalyticsSection
          : hasAnalyticsSection,
      hasApplicationsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasApplicationsSection ?? hasApplicationsSection
          : hasApplicationsSection,
      hasAutomationsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasAutomationsSection ?? hasAutomationsSection
          : hasAutomationsSection,
      hasDocumentsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasDocumentsSection ?? hasDocumentsSection
          : hasDocumentsSection,
      hasExpensesSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasExpensesSection ?? hasExpensesSection
          : hasExpensesSection,
      hasInboxSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasInboxSection ?? hasInboxSection
          : hasInboxSection,
      hasInvitationsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasInvitationsSection ?? hasInvitationsSection
          : hasInvitationsSection,
      hasLeasingSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasLeasingSection ?? hasLeasingSection
          : hasLeasingSection,
      hasManagerPaymentsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasManagerPaymentsSection ?? hasManagerPaymentsSection
          : hasManagerPaymentsSection,
      hasMembersSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasMembersSection ?? hasMembersSection
          : hasMembersSection,
      hasNotificationsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasNotificationsSection ?? hasNotificationsSection
          : hasNotificationsSection,
      hasOwnershipSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasOwnershipSection ?? hasOwnershipSection
          : hasOwnershipSection,
      hasVendorsSection:
        isOwnerRole
          ? ownerSectionAvailability?.hasVendorsSection ?? hasVendorsSection
          : hasVendorsSection
    }),
    [
      hasActivitySection,
      hasAnalyticsSection,
      hasApplicationsSection,
      hasAutomationsSection,
      hasDocumentsSection,
      hasExpensesSection,
      hasInboxSection,
      hasInvitationsSection,
      hasLeasingSection,
      hasManagerPaymentsSection,
      hasMembersSection,
      hasNotificationsSection,
      hasOwnershipSection,
      hasVendorsSection,
      isOwnerRole,
      ownerSectionAvailability
    ]
  );

  const [ownerWorkflowMode, setOwnerWorkflowMode] = useState<OwnerWorkflowMode>(
    props.initialOwnerWorkflowMode ?? "daily_ops"
  );
  const [managerWorkflowMode, setManagerWorkflowMode] = useState<ManagerWorkflowMode>(
    props.initialManagerWorkflowMode ?? "daily_ops"
  );
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPropertyWizardOpen, setIsPropertyWizardOpen] = useState(false);
  const [isTenantInviteWizardOpen, setIsTenantInviteWizardOpen] = useState(false);
  const [isLeaseWizardOpen, setIsLeaseWizardOpen] = useState(false);
  const [ownerDailyOpsStartsAtHome, setOwnerDailyOpsStartsAtHome] = useState(
    props.initialOwnerHomePage ?? false
  );
  const [isSectionLoading, setIsSectionLoading] = useState(false);
  const [, startRouteTransition] = useTransition();

  useEffect(() => {
    const nextMode = props.initialOwnerWorkflowMode;
    if (!nextMode) {
      return;
    }
    setOwnerWorkflowMode((current) => (current === nextMode ? current : nextMode));
  }, [props.initialOwnerWorkflowMode]);

  useEffect(() => {
    setOwnerDailyOpsStartsAtHome(props.initialOwnerHomePage ?? false);
    setIsSectionLoading(false);
  }, [props.initialOwnerHomePage, props.initialSectionId]);

  useEffect(() => {
    const nextMode = props.initialManagerWorkflowMode;
    if (!nextMode) {
      return;
    }
    setManagerWorkflowMode((current) => (current === nextMode ? current : nextMode));
  }, [props.initialManagerWorkflowMode]);

  const allSectionItems = useMemo(
    () =>
      buildAllSectionItems({
        chargeBadgeCount,
        maintenanceBadgeCount,
        inboxBadgeCount,
        notificationBadgeCount,
        hasActivitySection: navigationAvailability.hasActivitySection,
        hasAnalyticsSection: navigationAvailability.hasAnalyticsSection,
        hasLeasingSection: navigationAvailability.hasLeasingSection,
        hasApplicationsSection: navigationAvailability.hasApplicationsSection,
        hasManagerPaymentsSection: navigationAvailability.hasManagerPaymentsSection,
        hasMembersSection: navigationAvailability.hasMembersSection,
        hasInboxSection: navigationAvailability.hasInboxSection,
        hasAutomationsSection: navigationAvailability.hasAutomationsSection,
        hasNotificationsSection: navigationAvailability.hasNotificationsSection,
        hasOwnershipSection: navigationAvailability.hasOwnershipSection,
        hasInvitationsSection: navigationAvailability.hasInvitationsSection,
        hasDocumentsSection: navigationAvailability.hasDocumentsSection,
        hasVendorsSection: navigationAvailability.hasVendorsSection,
        hasExpensesSection: navigationAvailability.hasExpensesSection
      }),
    [
      chargeBadgeCount,
      maintenanceBadgeCount,
      inboxBadgeCount,
      notificationBadgeCount,
      navigationAvailability
    ]
  );

  const ownerModeNavItems = useMemo(
    () =>
      isOwnerRole
        ? getOwnerModeNavItems({
            hasAnalyticsSection: navigationAvailability.hasAnalyticsSection,
            hasManagerPaymentsSection: navigationAvailability.hasManagerPaymentsSection,
            hasMembersSection: navigationAvailability.hasMembersSection
          })
        : [],
    [isOwnerRole, navigationAvailability]
  );
  const managerModeNavItems = useMemo(
    () => (isManagerRole ? getManagerModeNavItems() : []),
    [isManagerRole]
  );

  const activeWorkflowMeta = useMemo(() => {
    if (isOwnerRole) {
      return ownerWorkflowModeMeta[ownerWorkflowMode];
    }
    if (isManagerRole) {
      return managerWorkflowModeMeta[managerWorkflowMode];
    }
    return null;
  }, [isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const workflowSectionItems = useMemo<NavItem[]>(() => {
    if (!activeWorkflowMeta) {
      return allSectionItems;
    }
    const allowedSections = new Set(activeWorkflowMeta.sections);
    const filtered = allSectionItems.filter((item) => allowedSections.has(item.id));
    return filtered.length > 0 ? filtered : allSectionItems;
  }, [activeWorkflowMeta, allSectionItems]);

  const ownerDailyOpsSectionItems = useMemo<NavItem[]>(
    () =>
      OWNER_DAILY_OPS_SECTION_IDS.map((sectionId) =>
        allSectionItems.find((item) => item.id === sectionId)
      ).filter((item): item is NavItem => Boolean(item)),
    [allSectionItems]
  );

  const sectionItems = useMemo<NavItem[]>(
    () =>
      isOwnerRole && ownerWorkflowMode === "daily_ops"
        ? ownerDailyOpsSectionItems
        : workflowSectionItems,
    [isOwnerRole, ownerDailyOpsSectionItems, ownerWorkflowMode, workflowSectionItems]
  );

  const [activeSection, setActiveSection] = useState(() => {
    return props.initialSectionId ?? "overview";
  });

  useEffect(() => {
    setActiveSection(props.initialSectionId ?? "overview");
  }, [props.initialSectionId]);

  const usesOwnerCache = ownerCache !== null;
  const ownerQuery = searchParams.toString();
  useEffect(() => {
    if (!usesOwnerCache) return;
    const params = new URLSearchParams(ownerQuery);
    const mode = resolveOwnerMode(params.get("mode"));
    setActiveSection(params.get("section") ?? "overview");
    setOwnerDailyOpsStartsAtHome(!params.has("section") && mode === "daily_ops");
    setOwnerWorkflowMode(mode);
  }, [ownerQuery, usesOwnerCache]);

  const isUnknownSection = !allSectionItems.some((item) => item.id === activeSection);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const ownerDailyOpsEnabled = isOwnerRole && ownerWorkflowMode === "daily_ops";
  const {
    currentPage: ownerDailyOpsPage,
    currentPageLabel: ownerDailyOpsPageLabel,
    currentPageCountLabel: ownerDailyOpsPageCountLabel,
    isHomePage: isOwnerDailyOpsHomePage,
    totalPages: ownerDailyOpsTotalPages,
    goToHomePage: goToOwnerDailyOpsHomePage,
    goToSectionPage
  } = useOwnerDailyOpsPagination({
    enabled: ownerDailyOpsEnabled,
    activeSection,
    startAtHome: ownerDailyOpsStartsAtHome,
    sectionItems: ownerDailyOpsSectionItems,
    onSelectSection: setActiveSection
  });

  const activeSectionIndex = sectionItems.findIndex((item) => item.id === activeSection);
  const activeSectionLabel =
    allSectionItems.find((item) => item.id === activeSection)?.label ?? "Section not found";

  const navigateOwnerDashboard = useCallback(
    (params: {
      nextOwnerMode: OwnerWorkflowMode;
      nextSectionId: string;
      startsAtHome: boolean;
    }) => {
      setOwnerWorkflowMode(params.nextOwnerMode);
      setOwnerDailyOpsStartsAtHome(params.startsAtHome);
      setActiveSection(params.nextSectionId);

      const nextParams = ownerCache?.navigationParams() ?? new URLSearchParams(searchParams.toString());
      if (params.nextOwnerMode === "daily_ops") {
        nextParams.delete("mode");
      } else {
        nextParams.set("mode", params.nextOwnerMode);
      }

      if (params.startsAtHome) {
        nextParams.delete("section");
      } else {
        nextParams.set("section", params.nextSectionId);
      }

      const nextQuery = nextParams.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

      if (nextUrl === currentUrl) {
        setIsSectionLoading(false);
        return;
      }

      if (ownerCache) {
        setIsSectionLoading(false);
        ownerCache.navigate(nextUrl, params.startsAtHome ? "daily-ops-home" : params.nextSectionId);
        return;
      }
      setIsSectionLoading(true);
      startRouteTransition(() => {
        router.replace(nextUrl);
      });
    },
    [ownerCache, pathname, router, searchParams, startRouteTransition]
  );

  const goToPreviousSection = () => {
    if (ownerDailyOpsEnabled) {
      if (ownerDailyOpsTotalPages === 0) {
        return;
      }

      const nextPage =
        ((ownerDailyOpsPage - 1) % ownerDailyOpsTotalPages + ownerDailyOpsTotalPages) %
        ownerDailyOpsTotalPages;
      if (nextPage === 0) {
        navigateOwnerDashboard({
          nextOwnerMode: "daily_ops",
          nextSectionId: "overview",
          startsAtHome: true
        });
        return;
      }

      const nextSectionId = ownerDailyOpsSectionItems[nextPage - 1]?.id;
      if (nextSectionId) {
        navigateOwnerDashboard({
          nextOwnerMode: "daily_ops",
          nextSectionId,
          startsAtHome: false
        });
      }
      return;
    }
    if (sectionItems.length === 0) {
      return;
    }
    const nextSectionId =
      activeSectionIndex < 0
        ? sectionItems[sectionItems.length - 1].id
        : sectionItems[(activeSectionIndex - 1 + sectionItems.length) % sectionItems.length].id;

    if (isOwnerRole) {
      navigateOwnerDashboard({
        nextOwnerMode: OWNER_SECTION_MODE_BY_ID[nextSectionId] ?? ownerWorkflowMode,
        nextSectionId,
        startsAtHome: false
      });
      return;
    }
    if (activeSectionIndex < 0) {
      setActiveSection(sectionItems[sectionItems.length - 1].id);
      return;
    }
    setActiveSection(nextSectionId);
  };

  const goToNextSection = () => {
    if (ownerDailyOpsEnabled) {
      if (ownerDailyOpsTotalPages === 0) {
        return;
      }

      const nextPage = (ownerDailyOpsPage + 1) % ownerDailyOpsTotalPages;
      if (nextPage === 0) {
        navigateOwnerDashboard({
          nextOwnerMode: "daily_ops",
          nextSectionId: "overview",
          startsAtHome: true
        });
        return;
      }

      const nextSectionId = ownerDailyOpsSectionItems[nextPage - 1]?.id;
      if (nextSectionId) {
        navigateOwnerDashboard({
          nextOwnerMode: "daily_ops",
          nextSectionId,
          startsAtHome: false
        });
      }
      return;
    }
    if (sectionItems.length === 0) {
      return;
    }
    const nextSectionId =
      activeSectionIndex < 0
        ? sectionItems[0].id
        : sectionItems[(activeSectionIndex + 1) % sectionItems.length].id;

    if (isOwnerRole) {
      navigateOwnerDashboard({
        nextOwnerMode: OWNER_SECTION_MODE_BY_ID[nextSectionId] ?? ownerWorkflowMode,
        nextSectionId,
        startsAtHome: false
      });
      return;
    }
    if (activeSectionIndex < 0) {
      setActiveSection(sectionItems[0].id);
      return;
    }
    setActiveSection(nextSectionId);
  };

  const openSection = useCallback(
    (sectionId: string) => {
      if (!allSectionItems.some((item) => item.id === sectionId)) {
        return;
      }

      const targetOwnerMode = isOwnerRole ? OWNER_SECTION_MODE_BY_ID[sectionId] : null;
      const usesOwnerDailyOps =
        isOwnerRole && (targetOwnerMode ?? ownerWorkflowMode) === "daily_ops";

      if (isOwnerRole && targetOwnerMode && ownerWorkflowMode !== targetOwnerMode) {
        setOwnerWorkflowMode(targetOwnerMode);
      }

      if (isOwnerRole) {
        navigateOwnerDashboard({
          nextOwnerMode: targetOwnerMode ?? ownerWorkflowMode,
          nextSectionId: sectionId,
          startsAtHome: false
        });
        return;
      }

      if (isManagerRole) {
        const targetMode = MANAGER_SECTION_MODE_BY_ID[sectionId];
        if (targetMode && managerWorkflowMode !== targetMode) {
          setManagerWorkflowMode(targetMode);
        }
      }

      if (usesOwnerDailyOps && goToSectionPage(sectionId)) {
        return;
      }

      setActiveSection(sectionId);
    },
    [
      allSectionItems,
      goToSectionPage,
      isManagerRole,
      isOwnerRole,
      managerWorkflowMode,
      navigateOwnerDashboard,
      ownerWorkflowMode
    ]
  );

  const goToSectionIfVisible = useCallback(
    (sectionId: string) => {
      if (allSectionItems.some((item) => item.id === sectionId)) {
        openSection(sectionId);
      }
    },
    [allSectionItems, openSection]
  );

  const goToHomePage = useCallback(() => {
    if (isOwnerRole) {
      navigateOwnerDashboard({
        nextOwnerMode: "daily_ops",
        nextSectionId: "overview",
        startsAtHome: true
      });
      return;
    }

    goToOwnerDailyOpsHomePage();
  }, [goToOwnerDailyOpsHomePage, isOwnerRole, navigateOwnerDashboard]);

  useEffect(() => {
    if (!isOwnerRole) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [isOwnerRole]);

  const handleModeChange = (
    mode: OwnerWorkflowMode | ManagerWorkflowMode,
    meta: typeof ownerWorkflowModeMeta | typeof managerWorkflowModeMeta,
    setMode: typeof setOwnerWorkflowMode | typeof setManagerWorkflowMode
  ) => {
    setMode(mode as never);
    const nextSection = meta[mode as keyof typeof meta].sections[0];
    if (nextSection) {
      setActiveSection(nextSection);
    }
  };

  const {
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess
  } = useDashboardWorkflowHandlers({
    goToSectionIfVisible,
    isOwnerRole,
    isManagerRole,
    ownerWorkflowMode,
    managerWorkflowMode
  });

  const sidebarItems = isOwnerRole
    ? ownerModeNavItems
    : isManagerRole
      ? managerModeNavItems
      : sectionItems;
  const sidebarActiveItemId = isOwnerRole
    ? activeSection === "analytics" ||
      activeSection === "manager-payments" ||
      activeSection === "members" ||
      activeSection === "tenants"
      ? activeSection
      : `owner:${ownerWorkflowMode}`
    : isManagerRole
      ? activeSection === "tenants"
        ? activeSection
        : `manager:${managerWorkflowMode}`
      : activeSection;
  const reportsHref = isOwnerRole
    ? props.activeAccountId
      ? `/owner/reports?account=${encodeURIComponent(props.activeAccountId)}`
      : "/owner/reports"
    : isManagerRole
      ? "/owner/reports"
      : null;

  const openCommandPalette = useCallback(() => {
    if (isOwnerRole) {
      setIsCommandPaletteOpen(true);
    }
  }, [isOwnerRole]);
  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);
  const openPropertyWizard = useCallback(() => {
    if (isOwnerRole) {
      setIsPropertyWizardOpen(true);
    }
  }, [isOwnerRole]);
  const closePropertyWizard = useCallback(() => {
    setIsPropertyWizardOpen(false);
  }, []);
  const openLeaseWizard = useCallback(() => {
    setIsLeaseWizardOpen(true);
  }, []);
  const closeLeaseWizard = useCallback(() => {
    setIsLeaseWizardOpen(false);
  }, []);
  const openTenantInviteWizard = useCallback(() => {
    if (props.onInviteTenant) {
      setIsTenantInviteWizardOpen(true);
    }
  }, [props.onInviteTenant]);
  const closeTenantInviteWizard = useCallback(() => {
    setIsTenantInviteWizardOpen(false);
  }, []);

  const handleSidebarSelect = (itemId: string) => {
    if (itemId === "analytics" && isOwnerRole) {
      openSection("analytics");
      return;
    }
    if (itemId === "manager-payments" && isOwnerRole) {
      openSection("manager-payments");
      return;
    }
    if (itemId === "members" && isOwnerRole) {
      openSection("members");
      return;
    }
    if (itemId === "notifications") {
      if (isOwnerRole) {
        navigateOwnerDashboard({
          nextOwnerMode: "records",
          nextSectionId: "notifications",
          startsAtHome: false
        });
        return;
      }
      if (isManagerRole) {
        setManagerWorkflowMode("daily_ops");
      }
      setActiveSection("notifications");
      return;
    }
    if (isOwnerRole && itemId.startsWith("owner:")) {
      if (itemId === "owner:daily_ops") {
        navigateOwnerDashboard({
          nextOwnerMode: "daily_ops",
          nextSectionId: "overview",
          startsAtHome: true
        });
        return;
      }
      if (itemId === "owner:new_property") {
        setIsPropertyWizardOpen(true);
        return;
      }
      if (itemId === "owner:new_tenant") {
        setIsTenantInviteWizardOpen(true);
        return;
      }
      const nextMode = itemId.replace("owner:", "") as OwnerWorkflowMode;
      const nextSection = ownerWorkflowModeMeta[nextMode].sections[0];
      if (nextSection) {
        navigateOwnerDashboard({
          nextOwnerMode: nextMode,
          nextSectionId: nextSection,
          startsAtHome: false
        });
      }
      return;
    }
    if (isManagerRole && itemId.startsWith("manager:")) {
      if (itemId === "manager:new_tenant") {
        setIsTenantInviteWizardOpen(true);
        return;
      }
      handleModeChange(
        itemId.replace("manager:", "") as ManagerWorkflowMode,
        managerWorkflowModeMeta,
        setManagerWorkflowMode
      );
      return;
    }
    openSection(itemId);
  };

  return {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    allSectionItems,
    isUnknownSection,
    sectionItems,
    ownerWorkflowMode,
    managerWorkflowMode,
    ownerDailyOpsEnabled,
    ownerDailyOpsPage,
    ownerDailyOpsPageLabel,
    ownerDailyOpsPageCountLabel,
    ownerDailyOpsTotalPages,
    isOwnerDailyOpsHomePage,
    isSectionLoading: isSectionLoading || Boolean(ownerCache?.loading),
    sidebarItems,
    sidebarActiveItemId,
    reportsHref,
    isCommandPaletteOpen,
    isPropertyWizardOpen,
    isLeaseWizardOpen,
    isTenantInviteWizardOpen,
    openSection,
    goToSectionIfVisible,
    goToPreviousSection,
    goToNextSection,
    goToHomePage,
    handleSidebarSelect,
    openCommandPalette,
    closeCommandPalette,
    openPropertyWizard,
    closePropertyWizard,
    openLeaseWizard,
    closeLeaseWizard,
    openTenantInviteWizard,
    closeTenantInviteWizard,
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess
  };
}

export type DashboardNavigationState = ReturnType<typeof useDashboardNavigation>;
