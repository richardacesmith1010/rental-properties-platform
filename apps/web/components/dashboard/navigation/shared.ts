import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAllSectionItems } from "../dashboard-config";
import type { DashboardKpiState } from "../dashboard-kpi-loader";
import type { DashboardProps } from "../types";
import type { NavItem } from "../sidebar-nav";

export interface SharedDashboardNavigation {
  activeSection: string;
  allSectionItems: NavItem[];
  isUnknownSection: boolean;
  navigationAvailability: ReturnType<typeof useNavigationAvailability>;
  sectionItems: NavItem[];
  setActiveSection: (section: string) => void;
}

function useNavigationAvailability(props: DashboardProps, kpis: DashboardKpiState) {
  const { ownerSectionAvailability } = props.capabilities ?? {};
  return useMemo(() => ({
    hasActivitySection: ownerSectionAvailability?.hasActivitySection ?? kpis.hasActivitySection,
    hasAnalyticsSection: ownerSectionAvailability?.hasAnalyticsSection ?? kpis.hasAnalyticsSection,
    hasApplicationsSection: ownerSectionAvailability?.hasApplicationsSection ?? kpis.hasApplicationsSection,
    hasAutomationsSection: ownerSectionAvailability?.hasAutomationsSection ?? kpis.hasAutomationsSection,
    hasDocumentsSection: ownerSectionAvailability?.hasDocumentsSection ?? kpis.hasDocumentsSection,
    hasExpensesSection: ownerSectionAvailability?.hasExpensesSection ?? kpis.hasExpensesSection,
    hasInboxSection: ownerSectionAvailability?.hasInboxSection ?? kpis.hasInboxSection,
    hasInvitationsSection: ownerSectionAvailability?.hasInvitationsSection ?? kpis.hasInvitationsSection,
    hasLeasingSection: ownerSectionAvailability?.hasLeasingSection ?? kpis.hasLeasingSection,
    hasManagerPaymentsSection: ownerSectionAvailability?.hasManagerPaymentsSection ?? kpis.hasManagerPaymentsSection,
    hasMembersSection: ownerSectionAvailability?.hasMembersSection ?? kpis.hasMembersSection,
    hasNotificationsSection: ownerSectionAvailability?.hasNotificationsSection ?? kpis.hasNotificationsSection,
    hasOwnershipSection: ownerSectionAvailability?.hasOwnershipSection ?? kpis.hasOwnershipSection,
    hasVendorsSection: ownerSectionAvailability?.hasVendorsSection ?? kpis.hasVendorsSection
  }), [kpis, ownerSectionAvailability]);
}

export function useSharedDashboardNavigation(props: DashboardProps, kpis: DashboardKpiState): SharedDashboardNavigation {
  const navigationAvailability = useNavigationAvailability(props, kpis);
  const allSectionItems = useMemo(() => buildAllSectionItems({
    chargeBadgeCount: kpis.chargeBadgeCount,
    maintenanceBadgeCount: kpis.maintenanceBadgeCount,
    inboxBadgeCount: kpis.inboxBadgeCount,
    notificationBadgeCount: kpis.notificationBadgeCount,
    ...navigationAvailability
  }), [kpis, navigationAvailability]);
  const [activeSection, setActiveSection] = useState(props.initialSectionId ?? "overview");

  useEffect(() => {
    setActiveSection(props.initialSectionId ?? "overview");
  }, [props.initialSectionId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  return {
    activeSection,
    allSectionItems,
    isUnknownSection: !allSectionItems.some((item) => item.id === activeSection),
    navigationAvailability,
    sectionItems: allSectionItems,
    setActiveSection
  };
}

export function useDashboardWizardState(props: DashboardProps) {
  const [isPropertyWizardOpen, setIsPropertyWizardOpen] = useState(false);
  const [isTenantInviteWizardOpen, setIsTenantInviteWizardOpen] = useState(false);
  const [isLeaseWizardOpen, setIsLeaseWizardOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const openPropertyWizard = useCallback(() => setIsPropertyWizardOpen(true), []);
  const closePropertyWizard = useCallback(() => setIsPropertyWizardOpen(false), []);
  const openLeaseWizard = useCallback(() => setIsLeaseWizardOpen(true), []);
  const closeLeaseWizard = useCallback(() => setIsLeaseWizardOpen(false), []);
  const openTenantInviteWizard = useCallback(() => {
    if (props.onInviteTenant) setIsTenantInviteWizardOpen(true);
  }, [props.onInviteTenant]);
  const closeTenantInviteWizard = useCallback(() => setIsTenantInviteWizardOpen(false), []);
  const openCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), []);
  return {
    isCommandPaletteOpen, isPropertyWizardOpen, isLeaseWizardOpen, isTenantInviteWizardOpen,
    openCommandPalette, closeCommandPalette, openPropertyWizard, closePropertyWizard,
    openLeaseWizard, closeLeaseWizard, openTenantInviteWizard, closeTenantInviteWizard
  };
}
