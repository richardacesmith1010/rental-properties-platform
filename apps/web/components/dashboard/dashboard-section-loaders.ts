import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useDashboardNavigation(props: DashboardProps, kpis: DashboardKpiState) {
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

  useEffect(() => {
    const nextMode = props.initialOwnerWorkflowMode;
    if (!nextMode) {
      return;
    }
    setOwnerWorkflowMode((current) => (current === nextMode ? current : nextMode));
  }, [props.initialOwnerWorkflowMode]);

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
        hasActivitySection,
        hasAnalyticsSection,
        hasLeasingSection,
        hasApplicationsSection,
        hasManagerPaymentsSection,
        hasMembersSection,
        hasInboxSection,
        hasAutomationsSection,
        hasNotificationsSection,
        hasOwnershipSection,
        hasInvitationsSection,
        hasDocumentsSection,
        hasVendorsSection,
        hasExpensesSection
      }),
    [
      chargeBadgeCount,
      maintenanceBadgeCount,
      inboxBadgeCount,
      notificationBadgeCount,
      hasActivitySection,
      hasAnalyticsSection,
      hasLeasingSection,
      hasApplicationsSection,
      hasManagerPaymentsSection,
      hasMembersSection,
      hasInboxSection,
      hasAutomationsSection,
      hasNotificationsSection,
      hasOwnershipSection,
      hasInvitationsSection,
      hasDocumentsSection,
      hasVendorsSection,
      hasExpensesSection
    ]
  );

  const ownerModeNavItems = useMemo(
    () =>
      isOwnerRole
        ? getOwnerModeNavItems({
            hasAnalyticsSection,
            hasManagerPaymentsSection,
            hasMembersSection
          })
        : [],
    [hasAnalyticsSection, hasManagerPaymentsSection, hasMembersSection, isOwnerRole]
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
    if (!props.initialSectionId) {
      return "overview";
    }
    return allSectionItems.some((item) => item.id === props.initialSectionId)
      ? props.initialSectionId
      : "overview";
  });

  useEffect(() => {
    if (!props.initialSectionId) {
      return;
    }
    if (allSectionItems.some((item) => item.id === props.initialSectionId)) {
      setActiveSection(props.initialSectionId);
    }
  }, [allSectionItems, props.initialSectionId]);

  useEffect(() => {
    if (!allSectionItems.some((item) => item.id === activeSection)) {
      setActiveSection("overview");
    }
  }, [activeSection, allSectionItems]);

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
    goToHomePage,
    goToNextPage: goToNextOwnerDailyOpsPage,
    goToPreviousPage: goToPreviousOwnerDailyOpsPage,
    goToSectionPage
  } = useOwnerDailyOpsPagination({
    enabled: ownerDailyOpsEnabled,
    activeSection,
    sectionItems: ownerDailyOpsSectionItems,
    onSelectSection: setActiveSection
  });

  const activeSectionIndex = sectionItems.findIndex((item) => item.id === activeSection);
  const activeSectionLabel =
    allSectionItems.find((item) => item.id === activeSection)?.label ?? "Overview";

  const goToPreviousSection = () => {
    if (ownerDailyOpsEnabled) {
      goToPreviousOwnerDailyOpsPage();
      return;
    }
    if (sectionItems.length === 0) {
      return;
    }
    if (activeSectionIndex < 0) {
      setActiveSection(sectionItems[sectionItems.length - 1].id);
      return;
    }
    setActiveSection(sectionItems[(activeSectionIndex - 1 + sectionItems.length) % sectionItems.length].id);
  };

  const goToNextSection = () => {
    if (ownerDailyOpsEnabled) {
      goToNextOwnerDailyOpsPage();
      return;
    }
    if (sectionItems.length === 0) {
      return;
    }
    if (activeSectionIndex < 0) {
      setActiveSection(sectionItems[0].id);
      return;
    }
    setActiveSection(sectionItems[(activeSectionIndex + 1) % sectionItems.length].id);
  };

  const goToSectionIfVisible = useCallback(
    (sectionId: string) => {
      if (allSectionItems.some((item) => item.id === sectionId)) {
        setActiveSection(sectionId);
      }
    },
    [allSectionItems]
  );

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
      ownerWorkflowMode
    ]
  );

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
        setOwnerWorkflowMode("records");
      }
      if (isManagerRole) {
        setManagerWorkflowMode("daily_ops");
      }
      setActiveSection("notifications");
      return;
    }
    if (isOwnerRole && itemId.startsWith("owner:")) {
      if (itemId === "owner:daily_ops") {
        if (ownerWorkflowMode !== "daily_ops") {
          setOwnerWorkflowMode("daily_ops");
        }
        goToHomePage();
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
      handleModeChange(
        itemId.replace("owner:", "") as OwnerWorkflowMode,
        ownerWorkflowModeMeta,
        setOwnerWorkflowMode
      );
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
    sectionItems,
    ownerWorkflowMode,
    managerWorkflowMode,
    ownerDailyOpsEnabled,
    ownerDailyOpsPage,
    ownerDailyOpsPageLabel,
    ownerDailyOpsPageCountLabel,
    ownerDailyOpsTotalPages,
    isOwnerDailyOpsHomePage,
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
