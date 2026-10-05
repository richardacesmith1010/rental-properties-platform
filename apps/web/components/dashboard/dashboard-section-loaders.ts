import { useCallback, useContext } from "react";
import type { DashboardProps } from "./types";
import type { DashboardKpiState } from "./dashboard-kpi-loader";
import { OwnerSectionCacheContext } from "./owner-section-cache";
import { useDashboardWorkflowHandlers } from "./dashboard-workflow-handlers";
import { useManagerNavigation } from "./navigation/manager";
import { useOwnerNavigation } from "./navigation/owner";
import { useDashboardWizardState, useSharedDashboardNavigation } from "./navigation/shared";
export { OwnerSectionCacheContext, useOwnerSectionCache } from "./owner-section-cache";
export type { OwnerSectionCacheProps } from "./owner-section-cache";

export function useDashboardNavigation(props: DashboardProps, kpis: DashboardKpiState) {
  const isOwnerRole = kpis.isOwnerRole;
  const isManagerRole = kpis.isManagerRole;
  const sharedProps = isOwnerRole
    ? props
    : { ...props, capabilities: props.capabilities ? { ...props.capabilities, ownerSectionAvailability: undefined } : undefined };
  const shared = useSharedDashboardNavigation(sharedProps, kpis);
  const owner = useOwnerNavigation(props, shared, isOwnerRole);
  const manager = useManagerNavigation(shared, isManagerRole);
  const wizards = useDashboardWizardState(props);
  const ownerCache = useContext(OwnerSectionCacheContext);
  const activeSectionIndex = shared.sectionItems.findIndex((item) => item.id === shared.activeSection);
  const openSection = isOwnerRole ? owner.openSection : manager.openSection;
  const workflowHandlers = useDashboardWorkflowHandlers({
    goToSectionIfVisible: openSection,
    isOwnerRole,
    isManagerRole
  });
  const sidebarItems = isOwnerRole ? owner.ownerNavItems : isManagerRole ? manager.managerNavItems : shared.sectionItems;
  const reportsHref = isOwnerRole
    ? props.activeAccountId ? `/owner/reports?account=${encodeURIComponent(props.activeAccountId)}` : "/owner/reports"
    : isManagerRole ? "/owner/reports" : null;
  const navigateOwnerDashboard = owner.navigateOwnerDashboard;
  const ownerOpenCommandPalette = owner.openCommandPalette;
  const wizardOpenProperty = wizards.openPropertyWizard;
  const goToHomePage = useCallback(() => {
    if (isOwnerRole) navigateOwnerDashboard("overview");
  }, [isOwnerRole, navigateOwnerDashboard]);
  const openPropertyWizard = useCallback(() => {
    if (isOwnerRole || isManagerRole) wizardOpenProperty();
  }, [isManagerRole, isOwnerRole, wizardOpenProperty]);
  const openCommandPalette = useCallback(() => {
    if (isOwnerRole) ownerOpenCommandPalette();
  }, [isOwnerRole, ownerOpenCommandPalette]);
  return {
    activeSection: shared.activeSection,
    activeSectionIndex,
    activeSectionLabel: isOwnerRole ? owner.activeSectionLabel : isManagerRole ? manager.managerNavItems.find((item) => item.id === shared.activeSection)?.label ?? "Section not found" : shared.allSectionItems.find((item) => item.id === shared.activeSection)?.label ?? "Section not found",
    activeWorkflowMeta: null,
    allSectionItems: shared.allSectionItems,
    isUnknownSection: shared.isUnknownSection,
    sectionItems: shared.sectionItems,
    isOwnerDailyOpsHomePage: isOwnerRole && shared.activeSection === "overview",
    isSectionLoading: Boolean(ownerCache?.loading),
    sidebarItems,
    sidebarActiveItemId: shared.activeSection,
    reportsHref,
    isCommandPaletteOpen: isOwnerRole ? owner.isCommandPaletteOpen : wizards.isCommandPaletteOpen,
    isPropertyWizardOpen: wizards.isPropertyWizardOpen,
    isLeaseWizardOpen: wizards.isLeaseWizardOpen,
    isTenantInviteWizardOpen: wizards.isTenantInviteWizardOpen,
    openSection,
    goToSectionIfVisible: openSection,
    goToPreviousSection: manager.goToPreviousSection,
    goToNextSection: manager.goToNextSection,
    goToHomePage,
    handleSidebarSelect: openSection,
    openCommandPalette,
    closeCommandPalette: owner.closeCommandPalette,
    openPropertyWizard,
    closePropertyWizard: wizards.closePropertyWizard,
    openLeaseWizard: wizards.openLeaseWizard,
    closeLeaseWizard: wizards.closeLeaseWizard,
    openTenantInviteWizard: wizards.openTenantInviteWizard,
    closeTenantInviteWizard: wizards.closeTenantInviteWizard,
    ...workflowHandlers
  };
}

export type DashboardNavigationState = ReturnType<typeof useDashboardNavigation>;
