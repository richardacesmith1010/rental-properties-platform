import { useContext, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildAllSectionItems,
  getManagerModeNavItems,
  getOwnerNavItems,
  managerWorkflowModeMeta,
  type ManagerWorkflowMode
} from "./dashboard-config";
import {
  MANAGER_SECTION_MODE_BY_ID
} from "./dashboard-workflow-modes";
import { useDashboardWorkflowHandlers } from "./dashboard-workflow-handlers";
import type { NavItem } from "./sidebar-nav";
import type { DashboardProps } from "./types";
import type { DashboardKpiState } from "./dashboard-kpi-loader";
import { OwnerSectionCacheContext } from "./owner-section-cache";
export { OwnerSectionCacheContext, useOwnerSectionCache } from "./owner-section-cache";
export type { OwnerSectionCacheProps } from "./owner-section-cache";

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

  const [managerWorkflowMode, setManagerWorkflowMode] = useState<ManagerWorkflowMode>(
    props.initialManagerWorkflowMode ?? "daily_ops"
  );
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPropertyWizardOpen, setIsPropertyWizardOpen] = useState(false);
  const [isTenantInviteWizardOpen, setIsTenantInviteWizardOpen] = useState(false);
  const [isLeaseWizardOpen, setIsLeaseWizardOpen] = useState(false);

  const [, startRouteTransition] = useTransition();

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

  const ownerNavItems = useMemo(() => getOwnerNavItems(allSectionItems), [allSectionItems]);
  const managerModeNavItems = useMemo(
    () => (isManagerRole ? getManagerModeNavItems() : []),
    [isManagerRole]
  );

  const activeWorkflowMeta = useMemo(() => {
    if (isManagerRole) {
      return managerWorkflowModeMeta[managerWorkflowMode];
    }
    return null;
  }, [isManagerRole, managerWorkflowMode]);

  const workflowSectionItems = useMemo<NavItem[]>(() => {
    if (!activeWorkflowMeta) {
      return allSectionItems;
    }
    const allowedSections = new Set(activeWorkflowMeta.sections);
    const filtered = allSectionItems.filter((item) => allowedSections.has(item.id));
    return filtered.length > 0 ? filtered : allSectionItems;
  }, [activeWorkflowMeta, allSectionItems]);

  const sectionItems = isOwnerRole ? allSectionItems : workflowSectionItems;

  const [activeSection, setActiveSection] = useState(() => {
    return props.initialSectionId ?? "overview";
  });

  useEffect(() => {
    setActiveSection(props.initialSectionId ?? "overview");
  }, [props.initialSectionId]);

  const usesOwnerCache = ownerCache !== null;
  const ownerQuery = searchParams.toString();
  useEffect(() => {
    if (!isOwnerRole) return;
    const params = new URLSearchParams(ownerQuery);
    setActiveSection(params.get("section") ?? (params.has("mode") || usesOwnerCache ? "overview" : props.initialSectionId ?? "overview"));
    if (params.has("mode")) {
      params.delete("mode");
      window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [isOwnerRole, ownerQuery, pathname, props.initialSectionId, usesOwnerCache]);

  const isUnknownSection = !allSectionItems.some((item) => item.id === activeSection);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const isOwnerDailyOpsHomePage = isOwnerRole && activeSection === "overview";
  const activeSectionIndex = sectionItems.findIndex(item => item.id === activeSection);
  const activeSectionLabel = (isOwnerRole ? ownerNavItems : allSectionItems)
    .find(item => item.id === activeSection)?.label ??
    (isOwnerRole && activeSection === "operations" ? "Add" : "Section not found");

  const navigateOwnerDashboard = useCallback((section: string) => {
    setActiveSection(section);
    const params = ownerCache?.navigationParams() ?? new URLSearchParams(searchParams.toString());
    params.delete("mode");
    if (section === "overview") params.delete("section");
    else params.set("section", section);
    const url = `${pathname}${params.size ? `?${params}` : ""}`;
    if (ownerCache) {
      ownerCache.navigate(url, section === "overview" ? "daily-ops-home" : section);
    } else {
      startRouteTransition(() => router.replace(url));
    }
  }, [ownerCache, pathname, router, searchParams]);

  const goToPreviousSection = () => {
    if (isOwnerRole || !sectionItems.length) return;
    setActiveSection(sectionItems[activeSectionIndex < 0 ? sectionItems.length - 1 :
      (activeSectionIndex - 1 + sectionItems.length) % sectionItems.length].id);
  };
  const goToNextSection = () => {
    if (isOwnerRole || !sectionItems.length) return;
    setActiveSection(sectionItems[activeSectionIndex < 0 ? 0 :
      (activeSectionIndex + 1) % sectionItems.length].id);
  };
  const openSection = useCallback((section: string) => {
    if (!allSectionItems.some(item => item.id === section)) return;
    if (isOwnerRole) { navigateOwnerDashboard(section); return; }
    if (isManagerRole) {
      const mode = MANAGER_SECTION_MODE_BY_ID[section];
      if (mode) setManagerWorkflowMode(mode);
    }
    setActiveSection(section);
  }, [allSectionItems, isOwnerRole, isManagerRole, navigateOwnerDashboard]);
  const goToSectionIfVisible = openSection;
  const goToHomePage = useCallback(() => {
    if (isOwnerRole) navigateOwnerDashboard("overview");
  }, [isOwnerRole, navigateOwnerDashboard]);

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
    mode: ManagerWorkflowMode,
    meta: typeof managerWorkflowModeMeta,
    setMode: typeof setManagerWorkflowMode
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
    managerWorkflowMode
  });

  const sidebarItems = isOwnerRole
    ? ownerNavItems
    : isManagerRole
      ? managerModeNavItems
      : sectionItems;
  const sidebarActiveItemId = isManagerRole
    ? activeSection === "tenants" ? activeSection : `manager:${managerWorkflowMode}`
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
    if (isOwnerRole) { openSection(itemId); return; }
    if (itemId === "notifications") {
      if (isManagerRole) setManagerWorkflowMode("daily_ops");
      setActiveSection("notifications");
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
    managerWorkflowMode,
    isOwnerDailyOpsHomePage,
    isSectionLoading: Boolean(ownerCache?.loading),
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
