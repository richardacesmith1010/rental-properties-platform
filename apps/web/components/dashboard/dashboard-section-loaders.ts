import { useContext, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildAllSectionItems,
  getManagerNavItems,
  getOwnerNavItems
} from "./dashboard-config";
import { useDashboardWorkflowHandlers } from "./dashboard-workflow-handlers";
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

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPropertyWizardOpen, setIsPropertyWizardOpen] = useState(false);
  const [isTenantInviteWizardOpen, setIsTenantInviteWizardOpen] = useState(false);
  const [isLeaseWizardOpen, setIsLeaseWizardOpen] = useState(false);

  const [, startRouteTransition] = useTransition();

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
  const managerNavItems = useMemo(
    () => (isManagerRole ? getManagerNavItems(allSectionItems) : []),
    [allSectionItems, isManagerRole]
  );

  const sectionItems = allSectionItems;

  const [activeSection, setActiveSection] = useState(() => {
    return props.initialSectionId ?? "overview";
  });
  const managerQueryRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!isManagerRole) return;
    const queryChanged = managerQueryRef.current !== ownerQuery;
    managerQueryRef.current = ownerQuery;
    const params = new URLSearchParams(ownerQuery);
    const requestedSection = params.get("section");
    const nextSection = requestedSection && allSectionItems.some((item) => item.id === requestedSection)
      ? requestedSection
      : "overview";
    if (queryChanged) {
      setActiveSection(nextSection);
    }
    if (params.has("mode")) {
      params.delete("mode");
      window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [allSectionItems, isManagerRole, ownerQuery, pathname]);

  const isUnknownSection = !allSectionItems.some((item) => item.id === activeSection);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const isOwnerDailyOpsHomePage = isOwnerRole && activeSection === "overview";
  const activeSectionIndex = sectionItems.findIndex(item => item.id === activeSection);
  const activeSectionLabel = (isOwnerRole ? ownerNavItems : isManagerRole ? managerNavItems : allSectionItems)
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
    setActiveSection(section);
    if (isManagerRole) {
      const params = new URLSearchParams(window.location.search);
      params.delete("mode");
      if (section === "overview") params.delete("section");
      else params.set("section", section);
      window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [allSectionItems, isManagerRole, isOwnerRole, navigateOwnerDashboard, pathname]);
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
  });

  const sidebarItems = isOwnerRole
    ? ownerNavItems
    : isManagerRole
      ? managerNavItems
      : sectionItems;
  const sidebarActiveItemId = activeSection;
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
    if (isOwnerRole || isManagerRole) {
      setIsPropertyWizardOpen(true);
    }
  }, [isManagerRole, isOwnerRole]);
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
    openSection(itemId);
  };

  return {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta: null,
    allSectionItems,
    isUnknownSection,
    sectionItems,
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
