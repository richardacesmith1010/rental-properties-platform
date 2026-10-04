"use client";

import { useContext, type ComponentProps, type ReactNode } from "react";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { DashboardLayoutProps } from "./dashboard-layout";
import { SectionRenderer } from "./section-renderer";
import { useDashboardCollections, useDashboardKpiData } from "./dashboard-kpi-loader";
import { OwnerSectionCacheContext, useOwnerSectionCache, type OwnerSectionCacheProps, useDashboardNavigation } from "./dashboard-section-loaders";
import { useDashboardHomeState } from "./dashboard-home-loader";
import { useDashboardCommandState } from "./dashboard-command-loader";
import type { DashboardProps } from "./types";

type SectionRendererProps = ComponentProps<typeof SectionRenderer>;
type LayoutProps = Omit<DashboardLayoutProps, "children" | "mainClassName" | "afterMain">;

export function OwnerSectionDataProvider({ children, ...props }: OwnerSectionCacheProps & { children: ReactNode }) {
  const cache = useOwnerSectionCache(props);
  return <OwnerSectionCacheContext.Provider value={cache}>{children}</OwnerSectionCacheContext.Provider>;
}

export function useDashboardData(serverProps: DashboardProps) {
  const ownerCache = useContext(OwnerSectionCacheContext);
  const overlay = ownerCache?.data;
  const props: DashboardProps = { ...serverProps, ...overlay,
    ...(overlay?.analytics !== undefined ? { analyticsData: overlay.analytics } : {}),
    ...(overlay?.expenses !== undefined ? { expensesData: overlay.expenses } : {}),
    ...(overlay?.managerPaymentsData !== undefined ? {
      managerPaymentConfigs: overlay.managerPaymentsData.configs,
      managerPayments: overlay.managerPaymentsData.payments,
      managerPaymentManagers: overlay.managerPaymentsData.managers,
      managerPaymentsWarning: overlay.managerPaymentsData.warning
    } : {})
  };
  const collections = useDashboardCollections(props);
  const baseKpis = useDashboardKpiData(props, collections);
  // Command-palette and section property picks must share the same invalidation path.
  const kpis = {
    ...baseKpis,
    selectProperty: ownerCache ? (propertyId: string | null) => {
      const params = ownerCache.navigationParams();
      if (propertyId) params.set("property", propertyId);
      else params.delete("property");
      ownerCache.fullNavigate(`${window.location.pathname}?${params.toString()}`);
    } : baseKpis.selectProperty
  };
  const navigation = useDashboardNavigation(props, kpis);
  const homeState = useDashboardHomeState(props, collections, kpis);
  const commandState = useDashboardCommandState(props, collections, kpis, navigation);

  const {
    safeAnalytics,
    safeAuditLogs,
    safeAutomationRules,
    safeAutomationTemplates,
    safeCapabilities,
    safeDocuments,
    safeExpenses,
    safeInboxThreads,
    safeListings,
    safeApplications,
    safeManagerPaymentConfigs,
    safeManagerPayments,
    safeManagerPaymentManagers,
    safeNotifications,
    safeOwnershipAccounts,
    safePortfolio,
    safeRentIncreaseHistory,
    safeTickets,
    safeVendors
  } = collections;
  const {
    canManagePortfolio,
    displayDashboardData,
    filteredPortfolio,
    filteredTickets,
    financialOverviewData,
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
    isManagerRole,
    isOwnerRole,
    occupancy,
    selectedProperty,
    selectedPropertyId,
    selectedPropertySummary,
    selectProperty,
    sortedVendors
  } = kpis;
  const {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    closeLeaseWizard,
    closePropertyWizard,
    closeTenantInviteWizard,
    goToNextSection,
    goToPreviousSection,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handlePropertyCreated,
    handleSidebarSelect,
    handleTenantInviteSuccess,
    handleUnitCreated,
    handleLeaseCreated,
    handleVendorCreatedSuccess,
    isSectionLoading,
    isUnknownSection,
    isLeaseWizardOpen,
    isOwnerDailyOpsHomePage,
    isPropertyWizardOpen,
    isTenantInviteWizardOpen,
    openCommandPalette,
    openLeaseWizard,
    openPropertyWizard,
    openSection,
    openTenantInviteWizard,
    reportsHref,
    sectionItems,
    sidebarActiveItemId,
    sidebarItems
  } = navigation;

  const accountSwitcher =
    isOwnerRole && props.activeAccountId && safeOwnershipAccounts.length > 0 ? (
      <AccountSwitcher
        onNavigate={ownerCache?.fullNavigate}
        accounts={safeOwnershipAccounts}
        activeAccountId={props.activeAccountId}
        onRenameOwnershipAccount={props.onRenameOwnershipAccount}
        pendingRenameRequests={props.pendingAccountRenameRequests}
      />
    ) : null;

  const sectionRendererProps = {
    ...props,
    data: displayDashboardData,
    activeSection,
    activeSectionLabel,
    occupancy,
    canManagePortfolio,
    safePortfolio,
    filteredPortfolio,
    tickets: safeTickets,
    filteredTickets,
    invitations: props.invitations ?? [],
    safeNotifications,
    safeInboxThreads,
    safeDocuments,
    safeAutomationTemplates,
    safeAutomationRules,
    safeListings,
    safeApplications,
    managerPaymentConfigs: safeManagerPaymentConfigs,
    managerPayments: safeManagerPayments,
    managerPaymentManagers: safeManagerPaymentManagers,
    managerPaymentsWarning: props.managerPaymentsWarning,
    safeVendors,
    safeExpenses,
    safeAnalytics,
    auditLogs: safeAuditLogs,
    rentIncreaseHistory: safeRentIncreaseHistory,
    safeOwnershipAccounts,
    availableProperties: safePortfolio.properties,
    selectedPropertyId,
    selectedProperty,
    selectedPropertySummary,
    onSelectProperty: selectProperty,
    safeCapabilities,
    sortedVendors,
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
    hasExpensesSection,
    hasAnalyticsSection,
    hasActivitySection,
    openSection,
    openLeaseWizard,
    openTenantInviteWizard,
    goToSectionIfVisible: navigation.goToSectionIfVisible,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess,
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated
  } satisfies SectionRendererProps;

  const layoutProps: LayoutProps = {
    userEmail: props.userEmail,
    role: props.data.profileRole,
    fullName: props.fullName,
    nickname: props.nickname,
    avatarUrl: props.avatarUrl,
    stripeConnected: props.stripeConnected,
    onSignOut: props.onSignOut,
    items: sidebarItems,
    activeItemId: sidebarActiveItemId,
    onSelectItem: handleSidebarSelect,
    unreadNotificationCount: kpis.notificationBadgeCount,
    notifications: safeNotifications,
    onDismissNotification: props.onMarkNotificationRead,
    onClearAllNotifications: props.onMarkAllNotificationsRead,
    onSendBatchPaymentReminder: props.onSendBatchPaymentReminder,
    onWaiveCharge: props.onWaiveCharge,
    onMarkManagerPaymentPaid: props.onMarkManagerPaymentPaid,
    searchItems: commandState.searchItems,
    onOpenCommandPalette: openCommandPalette,
    commandPaletteEnabled: isOwnerRole,
    reportsHref,
    accountSwitcher
  };

  return {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    isUnknownSection,
    goToNextSection,
    goToPreviousSection,
    isEmptyOwner: props.isEmpty && isOwnerRole,
    isManagerRole,
    isOwnerRole,
    isOwnerDailyOpsHomePage,
    isSectionLoading,
    layoutProps,
    commandPaletteProps: commandState.commandPaletteProps,
    occupancy,
    openPropertyWizard,
    closePropertyWizard,
    openLeaseWizard,
    closeLeaseWizard,
    openTenantInviteWizard,
    closeTenantInviteWizard,
    ownerOnboarding: homeState.ownerOnboarding,
    llcSetupPrompt: homeState.llcSetupPrompt,
    homeActionItems: homeState.homeActionItems,
    nextRentCollectionLabel: homeState.nextRentCollectionLabel,
    selectedPropertyId,
    selectedPropertySummary,
    financialOverviewData,
    displayDashboardData,
    filteredPortfolio,
    safePortfolio,
    sectionItems,
    sectionRendererProps,
    isPropertyWizardOpen,
    isLeaseWizardOpen,
    isTenantInviteWizardOpen,
    showOnboardingWizard:
      isOwnerRole &&
      safePortfolio.properties.length > 0 &&
      safePortfolio.units.length === 0 &&
      Boolean(props.onInviteTenant)
  };
}
