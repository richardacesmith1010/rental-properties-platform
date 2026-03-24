"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Bell, Building2, CreditCard, FileText, Receipt, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { DashboardData } from "@/lib/dashboard";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { PortfolioData } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { MaintenanceTicket } from "@/lib/maintenance";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { OnboardingChecklistStep } from "@/components/dashboard/onboarding-checklist";
import type { DashboardLayoutProps } from "./dashboard-layout";
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
  OWNER_DAILY_OPS_SECTION_IDS,
  useOwnerDailyOpsPagination
} from "./owner-daily-ops-pagination";
import type { GlobalSearchItem } from "./global-search";
import type {
  CommandPaletteProperty,
  CommandPaletteQuickAction,
  CommandPaletteSection,
  CommandPaletteTenant,
  CommandPaletteTransaction
} from "./command-palette";
import { SectionRenderer } from "./section-renderer";
import type { NavItem } from "./sidebar-nav";
import type { DashboardProps } from "./types";

const EMPTY_TICKETS: MaintenanceTicket[] = [];
const EMPTY_AUDIT_LOGS: AuditLogEntry[] = [];
const EMPTY_RENT_INCREASE_HISTORY: RentIncreaseEntry[] = [];

const OWNER_SECTION_MODE_BY_ID: Partial<Record<string, OwnerWorkflowMode>> = {
  charges: "daily_ops",
  payments: "records",
  maintenance: "daily_ops",
  applications: "new_tenant",
  inbox: "new_manager",
  automations: "new_manager",
  notifications: "records",
  activity: "records",
  expenses: "records",
  analytics: "daily_ops",
  operations: "new_property",
  portfolio: "daily_ops",
  units: "records",
  leases: "daily_ops",
  "manager-payments": "daily_ops",
  leasing: "new_tenant",
  invitations: "new_tenant",
  vendors: "new_manager",
  documents: "records",
  ownership: "records"
};

const MANAGER_SECTION_MODE_BY_ID: Partial<Record<string, ManagerWorkflowMode>> = {
  charges: "daily_ops",
  payments: "daily_ops",
  maintenance: "daily_ops",
  applications: "daily_ops",
  inbox: "daily_ops",
  automations: "daily_ops",
  notifications: "daily_ops",
  activity: "daily_ops",
  expenses: "daily_ops",
  analytics: "daily_ops",
  operations: "new_property",
  portfolio: "new_property",
  units: "new_property",
  leases: "new_property",
  leasing: "new_tenant",
  invitations: "new_tenant",
  documents: "new_tenant",
  vendors: "vendor_ops"
};

type SectionRendererProps = ComponentProps<typeof SectionRenderer>;
type LayoutProps = Omit<DashboardLayoutProps, "children" | "mainClassName" | "afterMain">;

interface OwnerOnboardingState {
  steps: OnboardingChecklistStep[];
  nextStepId: OnboardingChecklistStep["id"] | null;
  completedCount: number;
  totalSteps: number;
  shouldShow: boolean;
}

function buildPropertyAddress(property: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  const locality = [property.city, property.state, property.postalCode].filter(Boolean).join(" ");
  return [property.addressLine1, locality].filter(Boolean).join(", ");
}

function occursInUtcMonth(value: string, year: number, month: number): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month;
}

function computeFilteredKpis(params: {
  baseKpis: DashboardData["kpis"];
  charges: DashboardData["charges"];
  tickets: MaintenanceTicket[];
  portfolio: PortfolioData;
  netCashFlowCents: number;
}) {
  const { baseKpis, charges, tickets, portfolio, netCashFlowCents } = params;
  const activeLeases = portfolio.leases.filter((lease) => lease.active);
  const openTickets = tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  );
  const highPriorityTickets = openTickets.filter(
    (ticket) => ticket.priority === "high" || ticket.priority === "urgent"
  );
  const lateCharges = charges.filter((charge) => charge.status === "late");
  const currentMonth = new Date().getUTCMonth();
  const currentYear = new Date().getUTCFullYear();
  const currentMonthRentCharges = charges.filter((charge) => {
    if (charge.category !== "rent") {
      return false;
    }
    const dueDate = new Date(`${charge.dueDate}T00:00:00.000Z`);
    return (
      !Number.isNaN(dueDate.getTime()) &&
      dueDate.getUTCMonth() === currentMonth &&
      dueDate.getUTCFullYear() === currentYear
    );
  });
  const collectedRentCents = currentMonthRentCharges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const pendingRentCents = currentMonthRentCharges
    .filter((charge) => charge.status === "pending")
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const overdueRentCents = currentMonthRentCharges
    .filter((charge) => charge.status === "late")
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const outstandingCharges = charges.filter(
    (charge) => charge.status === "pending" || charge.status === "late"
  );
  const totalDueCents = collectedRentCents + pendingRentCents + overdueRentCents;

  return {
    ...baseKpis,
    monthlyGrossRentCents: activeLeases.reduce((sum, lease) => sum + lease.monthlyRentCents, 0),
    activeLeaseCount: activeLeases.length,
    occupiedUnits: portfolio.units.filter((unit) => unit.occupied).length,
    totalUnits: portfolio.units.length,
    openMaintenanceCount: openTickets.length,
    highPriorityMaintenanceCount: highPriorityTickets.length,
    lateRentCents: lateCharges.reduce((sum, charge) => sum + charge.amountCents, 0),
    lateAccountCount: new Set(
      lateCharges
        .map((charge) => charge.leaseId)
        .filter((leaseId): leaseId is string => Boolean(leaseId))
    ).size,
    collectedRentCents,
    pendingRentCents,
    overdueRentCents,
    collectionRate: totalDueCents > 0 ? (collectedRentCents / totalDueCents) * 100 : 0,
    outstandingCents: outstandingCharges.reduce((sum, charge) => sum + charge.amountCents, 0),
    outstandingAccountCount: new Set(
      outstandingCharges
        .map((charge) => charge.leaseId)
        .filter((leaseId): leaseId is string => Boolean(leaseId))
    ).size,
    netCashFlowCents
  };
}

export function useDashboardData(props: DashboardProps) {
  const resolvedGamification = props.gamification ?? {
    totalXp: 0,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  };
  const safePortfolio = useMemo<PortfolioData>(
    () =>
      props.portfolio ?? {
        properties: [],
        units: [],
        leases: [],
        tenants: []
      },
    [props.portfolio]
  );
  const safeDocuments: OwnerDocumentsData = props.documents ?? {
    templates: [],
    packets: [],
    propertyFiles: [],
    propertyFilesEnabled: true,
    propertyFilesWarning: null
  };
  const safeTickets = useMemo(() => props.tickets ?? EMPTY_TICKETS, [props.tickets]);
  const safeAuditLogs = useMemo(() => props.auditLogs ?? EMPTY_AUDIT_LOGS, [props.auditLogs]);
  const safeRentIncreaseHistory = useMemo(
    () => props.rentIncreaseHistory ?? EMPTY_RENT_INCREASE_HISTORY,
    [props.rentIncreaseHistory]
  );
  const safeExpenses: ExpenseDashboardData = props.expensesData ?? {
    enabled: true,
    warning: null,
    properties: [],
    expenses: [],
    pnlByProperty: [],
    monthlyByProperty: {},
    categoryByProperty: {}
  };
  const safeAnalytics: AnalyticsDashboardData = props.analyticsData ?? {
    enabled: false,
    rentMetrics: [],
    expenseCategories: [],
    occupancyMetrics: [],
    maintenanceMetrics: [],
    summaryKpis: {
      collectionRate: 0,
      avgDaysToPayment: 0,
      totalIncomeCentsYtd: 0,
      totalExpenseCentsYtd: 0,
      netIncomeCentsYtd: 0,
      maintenanceCostCentsYtd: 0
    }
  };
  const safeCapabilities: FeatureCapabilitiesDTO = props.capabilities ?? {
    documentsEnabled: true,
    documentAssetAccessEnabled: true,
    notificationsEnabled: true,
    vendorWorkflowEnabled: true,
    photoWorkflowEnabled: true,
    ownershipEnabled: true,
    leasingPipelineEnabled: true,
    inboxThreadsEnabled: true,
    automationsEnabled: true,
    warnings: {}
  };
  const safeDashboardData = useMemo<DashboardData>(
    () => ({
      ...props.data,
      kpis: {
        ...props.data.kpis,
        netCashFlowCents: safeAnalytics.summaryKpis.netIncomeCentsYtd
      }
    }),
    [props.data, safeAnalytics.summaryKpis.netIncomeCentsYtd]
  );
  const safeOwnershipAccounts = useMemo<OwnershipAccountDTO[]>(
    () => props.ownershipAccounts ?? [],
    [props.ownershipAccounts]
  );
  const activeOwnershipAccount = useMemo(
    () =>
      (props.activeAccountId
        ? safeOwnershipAccounts.find((account) => account.id === props.activeAccountId)
        : safeOwnershipAccounts[0]) ?? null,
    [props.activeAccountId, safeOwnershipAccounts]
  );
  const safeNotifications = props.notifications ?? [];
  const safeInboxThreads = props.inboxThreads ?? [];
  const safeAutomationTemplates = props.automationTemplates ?? [];
  const safeAutomationRules = props.automationRules ?? [];
  const safeListings = props.listings ?? [];
  const safeApplications = props.applications ?? [];
  const safeManagerPaymentConfigs = props.managerPaymentConfigs ?? [];
  const safeManagerPayments = props.managerPayments ?? [];
  const safeManagerPaymentManagers = props.managerPaymentManagers ?? [];
  const safeVendors = props.vendors ?? [];
  const sortedVendors = [...safeVendors].sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return Number(right.preferred) - Number(left.preferred);
    }
    return left.name.localeCompare(right.name);
  });

  const isOwnerRole = safeDashboardData.profileRole === "owner";
  const isManagerRole = safeDashboardData.profileRole === "manager";
  const canManagePortfolio = isOwnerRole || isManagerRole;
  const propertyFilteringEnabled = isOwnerRole && safePortfolio.properties.length > 0;
  const chargeBadgeCount = safeDashboardData.charges.filter(
    (charge) => charge.status === "pending" || charge.status === "late"
  ).length;
  const maintenanceBadgeCount = safeTickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const inboxBadgeCount = safeInboxThreads.length;
  const notificationBadgeCount = safeNotifications.filter((notification) => !notification.readAt).length;
  const hasNotificationsSection = Boolean(props.onMarkNotificationRead);
  const hasActivitySection = isOwnerRole || isManagerRole;
  const hasInboxSection = Boolean(props.onMarkNotificationRead);
  const hasAutomationsSection = isOwnerRole || isManagerRole;
  const hasOwnershipSection = Boolean(
    props.onCreateOwnershipAccount && props.onLinkPropertyToOwnershipAccount
  );
  const hasInvitationsSection = Boolean(
    props.onInviteTenant && props.onInviteManager && props.onResendInvite
  );
  const hasLeasingSection = Boolean(canManagePortfolio && hasInvitationsSection);
  const hasApplicationsSection = Boolean(
    canManagePortfolio && safeCapabilities.leasingPipelineEnabled
  );
  const hasDocumentsSection = Boolean(
    props.onCreateDocumentTemplate &&
      props.onDeleteDocumentTemplate &&
      props.onCreateDocumentPacket &&
      props.onSendDocumentPacket
  );
  const hasVendorsSection = Boolean(props.onCreateVendor);
  const hasExpensesSection = Boolean(
    canManagePortfolio && props.onCreateExpense && props.onUpdateExpense && props.onDeleteExpense
  );
  const hasManagerPaymentsSection = Boolean(
    isOwnerRole &&
      (props.onSetupManagerPaymentConfig ||
        props.onRecordManagerPayment ||
        safeManagerPaymentConfigs.length > 0 ||
        safeManagerPayments.length > 0 ||
        safeManagerPaymentManagers.length > 0 ||
        props.managerPaymentsWarning)
  );
  const hasAnalyticsSection = Boolean(canManagePortfolio && safeAnalytics.enabled);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    if (!propertyFilteringEnabled || !props.initialPropertyId) {
      return null;
    }
    return safePortfolio.properties.some((property) => property.id === props.initialPropertyId)
      ? props.initialPropertyId
      : null;
  });

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

  const syncPropertyUrl = useCallback((propertyId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (propertyId) {
      params.set("property", propertyId);
    } else {
      params.delete("property");
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  useEffect(() => {
    if (!propertyFilteringEnabled) {
      setSelectedPropertyId(null);
      return;
    }

    const currentSelectionIsValid =
      selectedPropertyId != null &&
      safePortfolio.properties.some((property) => property.id === selectedPropertyId);

    if (currentSelectionIsValid) {
      return;
    }

    const initialSelection =
      props.initialPropertyId &&
      safePortfolio.properties.some((property) => property.id === props.initialPropertyId)
        ? props.initialPropertyId
        : null;

    setSelectedPropertyId(initialSelection);
  }, [
    propertyFilteringEnabled,
    props.initialPropertyId,
    safePortfolio.properties,
    selectedPropertyId
  ]);

  const selectProperty = useCallback(
    (propertyId: string | null) => {
      if (!propertyFilteringEnabled) {
        return;
      }

      const nextPropertyId =
        propertyId && safePortfolio.properties.some((property) => property.id === propertyId)
          ? propertyId
          : null;

      setSelectedPropertyId(nextPropertyId);
      syncPropertyUrl(nextPropertyId);
    },
    [propertyFilteringEnabled, safePortfolio.properties, syncPropertyUrl]
  );

  const selectedProperty = useMemo(
    () =>
      propertyFilteringEnabled && selectedPropertyId
        ? safePortfolio.properties.find((property) => property.id === selectedPropertyId) ?? null
        : null,
    [propertyFilteringEnabled, safePortfolio.properties, selectedPropertyId]
  );

  const filteredPortfolio = useMemo<PortfolioData>(() => {
    if (!selectedProperty) {
      return safePortfolio;
    }

    return {
      properties: safePortfolio.properties.filter((property) => property.id === selectedProperty.id),
      units: safePortfolio.units.filter((unit) => unit.propertyId === selectedProperty.id),
      leases: safePortfolio.leases.filter((lease) => lease.propertyId === selectedProperty.id),
      tenants: safePortfolio.tenants.filter((tenant) =>
        tenant.propertyIds.includes(selectedProperty.id)
      )
    };
  }, [safePortfolio, selectedProperty]);

  const filteredTickets = useMemo(
    () =>
      selectedProperty
        ? safeTickets.filter((ticket) => ticket.propertyId === selectedProperty.id)
        : safeTickets,
    [safeTickets, selectedProperty]
  );

  const filteredCharges = useMemo(
    () =>
      selectedProperty
        ? safeDashboardData.charges.filter((charge) => charge.propertyId === selectedProperty.id)
        : safeDashboardData.charges,
    [safeDashboardData.charges, selectedProperty]
  );

  const selectedPropertyNetCashFlowCents = useMemo(() => {
    if (!selectedProperty) {
      return safeAnalytics.summaryKpis.netIncomeCentsYtd;
    }

    return (
      safeExpenses.pnlByProperty.find((row) => row.propertyId === selectedProperty.id)?.netCents ?? 0
    );
  }, [safeAnalytics.summaryKpis.netIncomeCentsYtd, safeExpenses.pnlByProperty, selectedProperty]);

  const filteredKpis = useMemo(
    () =>
      computeFilteredKpis({
        baseKpis: safeDashboardData.kpis,
        charges: filteredCharges,
        tickets: filteredTickets,
        portfolio: filteredPortfolio,
        netCashFlowCents: selectedPropertyNetCashFlowCents
      }),
    [
      filteredCharges,
      filteredPortfolio,
      filteredTickets,
      safeDashboardData.kpis,
      selectedPropertyNetCashFlowCents
    ]
  );

  const displayDashboardData = useMemo<DashboardData>(
    () => ({
      ...safeDashboardData,
      charges: filteredCharges,
      kpis: filteredKpis
    }),
    [filteredCharges, filteredKpis, safeDashboardData]
  );

  const occupancy =
    displayDashboardData.kpis.totalUnits > 0
      ? Math.round(
          (displayDashboardData.kpis.occupiedUnits / displayDashboardData.kpis.totalUnits) * 100
        )
      : 0;

  const selectedPropertySummary = useMemo(() => {
    if (!selectedProperty) {
      return null;
    }

    return {
      property: {
        id: selectedProperty.id,
        name: selectedProperty.name,
        address: buildPropertyAddress(selectedProperty)
      },
      unitCount: filteredPortfolio.units.length,
      occupiedUnits: filteredPortfolio.units.filter((unit) => unit.occupied).length,
      monthlyRentCents: displayDashboardData.kpis.monthlyGrossRentCents,
      openTickets: filteredTickets.filter(
        (ticket) => ticket.status === "open" || ticket.status === "in_progress"
      ).length
    };
  }, [displayDashboardData.kpis.monthlyGrossRentCents, filteredPortfolio.units, filteredTickets, selectedProperty]);

  const financialOverviewData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const currentYearStartIso = `${currentYear}-01-01`;
    const expensePropertyId = selectedProperty?.id ?? null;
    const visibleExpenses = expensePropertyId
      ? safeExpenses.expenses.filter((expense) => expense.propertyId === expensePropertyId)
      : safeExpenses.expenses;
    const monthlyExpensesCents = visibleExpenses
      .filter((expense) => occursInUtcMonth(expense.expenseDate, currentYear, currentMonth))
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    const ytdExpensesCents = visibleExpenses
      .filter((expense) => expense.expenseDate >= currentYearStartIso)
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    const ytdIncomeCents = filteredCharges
      .filter((charge) => charge.status === "paid" && charge.dueDate >= currentYearStartIso)
      .reduce((sum, charge) => sum + charge.amountCents, 0);
    const monthlyCollectedCents = displayDashboardData.kpis.collectedRentCents;
    const monthlyOutstandingCents = displayDashboardData.kpis.outstandingCents;

    return {
      accountId: activeOwnershipAccount?.id ?? null,
      plaidConnected: activeOwnershipAccount?.plaidConnected ?? false,
      bankName: activeOwnershipAccount?.bankName ?? null,
      bankMask: activeOwnershipAccount?.bankMask ?? null,
      balanceCents: activeOwnershipAccount?.balanceCents ?? null,
      balanceUpdatedAt: activeOwnershipAccount?.balanceUpdatedAt ?? null,
      monthlyCollectedCents,
      monthlyOutstandingCents,
      monthlyExpensesCents,
      netIncomeCents: monthlyCollectedCents - monthlyExpensesCents,
      ytdIncomeCents,
      ytdExpensesCents,
      collectionRate: displayDashboardData.kpis.collectionRate
    };
  }, [
    activeOwnershipAccount,
    displayDashboardData.kpis.collectedRentCents,
    displayDashboardData.kpis.collectionRate,
    displayDashboardData.kpis.outstandingCents,
    filteredCharges,
    safeExpenses.expenses,
    selectedProperty
  ]);

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
    () => (isOwnerRole ? getOwnerModeNavItems({ hasAnalyticsSection }) : []),
    [hasAnalyticsSection, isOwnerRole]
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

      if (isOwnerRole) {
        if (targetOwnerMode && ownerWorkflowMode !== targetOwnerMode) {
          setOwnerWorkflowMode(targetOwnerMode);
        }
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

  const handlePropertyCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("portfolio");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);
  const handleUnitCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("units");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);
  const handleLeaseCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("leases");
      return;
    }
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("documents");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);
  const handleTenantInviteSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("leasing");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);
  const handleManagerInviteSuccess = useCallback(() => {
    if (isOwnerRole && ownerWorkflowMode === "new_manager") {
      goToSectionIfVisible("vendors");
    }
  }, [goToSectionIfVisible, isOwnerRole, ownerWorkflowMode]);
  const handleOwnerInviteSuccess = useCallback(() => {
    if (isOwnerRole) {
      goToSectionIfVisible("ownership");
    }
  }, [goToSectionIfVisible, isOwnerRole]);
  const handleVendorCreatedSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_manager") ||
      (isManagerRole && managerWorkflowMode === "vendor_ops")
    ) {
      goToSectionIfVisible("maintenance");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const sidebarItems = isOwnerRole
    ? ownerModeNavItems
    : isManagerRole
      ? managerModeNavItems
      : sectionItems;
  const sidebarActiveItemId = isOwnerRole
    ? activeSection === "analytics" || activeSection === "manager-payments"
      ? activeSection
      : `owner:${ownerWorkflowMode}`
    : isManagerRole
      ? `manager:${managerWorkflowMode}`
      : activeSection;
  const reportsHref = isOwnerRole
    ? props.activeAccountId
      ? `/owner/reports?account=${encodeURIComponent(props.activeAccountId)}`
      : "/owner/reports"
    : isManagerRole
      ? "/owner/reports"
      : null;
  const accountSwitcher =
    isOwnerRole && props.activeAccountId && safeOwnershipAccounts.length > 0 ? (
      <AccountSwitcher
        accounts={safeOwnershipAccounts}
        activeAccountId={props.activeAccountId}
        onRenameOwnershipAccount={props.onRenameOwnershipAccount}
        pendingRenameRequests={props.pendingAccountRenameRequests}
      />
    ) : null;
  const ownerOnboarding = useMemo<OwnerOnboardingState>(() => {
    if (!isOwnerRole) {
      return {
        steps: [],
        nextStepId: null,
        completedCount: 0,
        totalSteps: 0,
        shouldShow: false
      };
    }

    const steps: OnboardingChecklistStep[] = [
      {
        id: "profile",
        label: "Profile completed",
        description: "Your name and contact info are ready to use throughout Domus.",
        completed: true
      },
      {
        id: "account",
        label: "Account set up",
        description: "Your ownership account is ready for properties, members, and payouts.",
        completed: Boolean(props.activeAccountId ?? safeOwnershipAccounts[0]?.id)
      },
      {
        id: "property",
        label: "Add a property",
        description: "Enter your first property address and core details.",
        completed: safePortfolio.properties.length > 0
      },
      {
        id: "unit",
        label: "Add a unit",
        description: "Create at least one rentable unit inside your property.",
        completed: safePortfolio.units.length > 0
      },
      {
        id: "lease",
        label: "Create a lease",
        description: "Set rent, dates, and tenant details so charges can start flowing.",
        completed: safePortfolio.leases.length > 0
      },
      {
        id: "bank",
        label: "Connect bank account",
        description: "Link your payout and rent-collection account to finish setup.",
        completed: props.stripeConnected === true
      }
    ];

    const completedCount = steps.filter((step) => step.completed).length;
    const nextStepId = steps.find((step) => !step.completed)?.id ?? null;

    return {
      steps,
      nextStepId,
      completedCount,
      totalSteps: steps.length,
      shouldShow: nextStepId !== null
    };
  }, [
    isOwnerRole,
    props.activeAccountId,
    props.stripeConnected,
    safeOwnershipAccounts,
    safePortfolio.leases.length,
    safePortfolio.properties.length,
    safePortfolio.units.length
  ]);

  const commandPaletteSections = useMemo<CommandPaletteSection[]>(
    () =>
      allSectionItems.map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description ?? `${item.label} section`,
        icon: item.icon,
        keywords: [item.label, item.description, item.clickHint].filter(
          (value): value is string => Boolean(value)
        )
      })),
    [allSectionItems]
  );

  const commandPaletteProperties = useMemo<CommandPaletteProperty[]>(
    () =>
      safePortfolio.properties.map((property) => ({
        id: property.id,
        name: property.name,
        address: [property.addressLine1, property.city, property.state]
          .filter(Boolean)
          .join(", ")
      })),
    [safePortfolio.properties]
  );

  const commandPaletteTenants = useMemo<CommandPaletteTenant[]>(
    () =>
      safePortfolio.tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.fullName || tenant.email,
        email: tenant.email
      })),
    [safePortfolio.tenants]
  );

  const commandPaletteTransactions = useMemo<CommandPaletteTransaction[]>(
    () => [
      ...displayDashboardData.charges.slice(0, 8).map((charge) => ({
        id: `charge:${charge.id}`,
        label: `${charge.propertyName} • ${charge.unitNumber}`,
        description: `${charge.tenantName} • ${charge.status} • ${formatDate(charge.dueDate)}`,
        sectionId: "charges",
        propertyId: charge.propertyId,
        icon: Receipt,
        keywords: [charge.propertyName, charge.unitNumber, charge.tenantName, charge.status]
      })),
      ...safeDashboardData.recentPayments.slice(0, 6).map((payment) => ({
        id: `payment:${payment.id}`,
        label: `${payment.propertyName} • ${payment.unitNumber}`,
        description: `${payment.method} • ${formatDate(payment.paidAt)}`,
        sectionId: "payments",
        icon: CreditCard,
        keywords: [payment.propertyName, payment.unitNumber, payment.method]
      }))
    ],
    [displayDashboardData.charges, safeDashboardData.recentPayments]
  );

  const commandPaletteQuickActions = useMemo<CommandPaletteQuickAction[]>(
    () =>
      isOwnerRole
        ? [
            {
              id: "add-property",
              label: "Add Property",
              description: "Start the new property workflow.",
              icon: Building2,
              keywords: ["property", "create", "operations"]
            },
            {
              id: "create-lease",
              label: "Create Lease",
              description: "Jump to lease setup for a new resident.",
              icon: FileText,
              keywords: ["lease", "tenant", "move in"]
            },
            {
              id: "new-tenant",
              label: "New Tenant",
              description: "Open the tenant onboarding workflow.",
              icon: UserPlus,
              keywords: ["invite", "tenant", "leasing"]
            },
            {
              id: "open-notifications",
              label: "Review Notifications",
              description: "Open the owner activity feed.",
              icon: Bell,
              keywords: ["alerts", "activity", "feed"]
            }
          ]
        : [],
    [isOwnerRole]
  );

  const searchItems = useMemo<GlobalSearchItem[]>(() => {
    const basePath = isOwnerRole ? "/owner" : isManagerRole ? "/manager" : null;
    if (!basePath) {
      return [];
    }

    const accountQuery =
      isOwnerRole && props.activeAccountId
        ? `&account=${encodeURIComponent(props.activeAccountId)}`
        : "";
    const propertyQuery = selectedPropertyId
      ? `&property=${encodeURIComponent(selectedPropertyId)}`
      : "";
    const sectionHref = (section: string) =>
      `${basePath}?section=${section}${accountQuery}${propertyQuery}`;

    return [
      ...filteredPortfolio.properties.map((property) => ({
        id: `property:${property.id}`,
        label: property.name,
        category: "Properties",
        href: sectionHref("portfolio"),
        description: [property.addressLine1, property.city, property.state]
          .filter(Boolean)
          .join(", "),
        keywords: [property.name, property.addressLine1, property.city, property.state]
      })),
      ...filteredPortfolio.units.map((unit) => ({
        id: `unit:${unit.id}`,
        label: `Unit ${unit.unitNumber}`,
        category: "Units",
        href: sectionHref("units"),
        description: unit.propertyName,
        keywords: [unit.unitNumber, unit.propertyName]
      })),
      ...filteredPortfolio.leases.map((lease) => ({
        id: `lease:${lease.id}`,
        label: lease.tenantEmail,
        category: "Leases",
        href: sectionHref("leases"),
        description: `${lease.unitLabel} • ${formatDate(lease.endDate)}`,
        keywords: [lease.tenantEmail, lease.unitLabel, lease.leaseStatus]
      })),
      ...filteredPortfolio.tenants.map((tenant) => ({
        id: `tenant:${tenant.id}`,
        label: tenant.fullName || tenant.email,
        category: "Tenants",
        href: sectionHref("leases"),
        description: tenant.email,
        keywords: [tenant.fullName, tenant.email]
      })),
      ...filteredTickets.map((ticket) => ({
        id: `ticket:${ticket.id}`,
        label: ticket.title,
        category: "Maintenance",
        href: sectionHref("maintenance"),
        description: `${ticket.propertyName}${ticket.unitNumber ? ` • ${ticket.unitNumber}` : ""}`,
        keywords: [ticket.title, ticket.description, ticket.propertyName, ticket.unitNumber ?? ""]
      })),
      ...displayDashboardData.charges.map((charge) => ({
        id: `charge:${charge.id}`,
        label: `${charge.propertyName} • ${charge.unitNumber}`,
        category: "Charges",
        href: sectionHref("charges"),
        description: `${charge.tenantName} • ${charge.status} • ${formatDate(charge.dueDate)}`,
        keywords: [charge.propertyName, charge.unitNumber, charge.tenantName, charge.status]
      })),
      ...safeAuditLogs.map((log) => ({
        id: `activity:${log.id}`,
        label: log.action.replace(/_/g, " "),
        category: "Activity",
        href: sectionHref("activity"),
        description: log.userName,
        keywords: [log.action, log.entityType, log.userName]
      }))
    ];
  }, [
    isOwnerRole,
    isManagerRole,
    props.activeAccountId,
    displayDashboardData.charges,
    filteredPortfolio.leases,
    filteredPortfolio.properties,
    filteredPortfolio.tenants,
    filteredPortfolio.units,
    filteredTickets,
    selectedPropertyId,
    safeAuditLogs,
  ]);

  const handleSidebarSelect = (itemId: string) => {
    if (itemId === "analytics" && isOwnerRole) {
      openSection("analytics");
      return;
    }
    if (itemId === "manager-payments" && isOwnerRole) {
      openSection("manager-payments");
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
      handleModeChange(itemId.replace("owner:", "") as OwnerWorkflowMode, ownerWorkflowModeMeta, setOwnerWorkflowMode);
      return;
    }
    if (isManagerRole && itemId.startsWith("manager:")) {
      if (itemId === "manager:new_tenant") {
        setIsTenantInviteWizardOpen(true);
        return;
      }
      handleModeChange(itemId.replace("manager:", "") as ManagerWorkflowMode, managerWorkflowModeMeta, setManagerWorkflowMode);
      return;
    }
    openSection(itemId);
  };

  const openCommandPalette = useCallback(() => {
    if (isOwnerRole) {
      setIsCommandPaletteOpen(true);
    }
  }, [isOwnerRole]);
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

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const handleCommandPaletteSectionSelect = useCallback(
    (sectionId: string) => {
      openSection(sectionId);
      closeCommandPalette();
    },
    [closeCommandPalette, openSection]
  );

  const handleCommandPalettePropertySelect = useCallback(
    (propertyId: string) => {
      selectProperty(propertyId);
      openSection("overview");
      closeCommandPalette();
    },
    [closeCommandPalette, openSection, selectProperty]
  );

  const handleCommandPaletteTenantSelect = useCallback(
    (tenantId: string) => {
      const tenant = safePortfolio.tenants.find((item) => item.id === tenantId);
      if (tenant?.propertyIds.length === 1) {
        selectProperty(tenant.propertyIds[0]);
      }
      openSection("leases");
      closeCommandPalette();
    },
    [closeCommandPalette, openSection, safePortfolio.tenants, selectProperty]
  );

  const handleCommandPaletteQuickActionSelect = useCallback(
    (actionId: string) => {
      if (!isOwnerRole) {
        return;
      }

      if (actionId === "add-property") {
        setIsPropertyWizardOpen(true);
      }

      if (actionId === "create-lease") {
        setOwnerWorkflowMode("daily_ops");
        setActiveSection("leases");
        setIsLeaseWizardOpen(true);
      }

      if (actionId === "new-tenant") {
        setIsTenantInviteWizardOpen(true);
      }

      if (actionId === "open-notifications") {
        setOwnerWorkflowMode("daily_ops");
        setActiveSection("notifications");
      }

      closeCommandPalette();
    },
    [closeCommandPalette, isOwnerRole]
  );

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
    goToSectionIfVisible,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess,
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated,
    isOwnerDailyOpsCarousel: isOwnerRole && ownerWorkflowMode === "daily_ops"
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
    unreadNotificationCount: notificationBadgeCount,
    notifications: safeNotifications,
    onDismissNotification: props.onMarkNotificationRead,
    onClearAllNotifications: props.onMarkAllNotificationsRead,
    searchItems,
    onOpenCommandPalette: openCommandPalette,
    commandPaletteEnabled: isOwnerRole,
    reportsHref,
    accountSwitcher
  };

  const commandPaletteProps = {
    open: isCommandPaletteOpen,
    onClose: closeCommandPalette,
    sections: commandPaletteSections,
    properties: commandPaletteProperties,
    tenants: commandPaletteTenants,
    transactions: commandPaletteTransactions,
    quickActions: commandPaletteQuickActions,
    onSelectSection: handleCommandPaletteSectionSelect,
    onSelectProperty: handleCommandPalettePropertySelect,
    onSelectTenant: handleCommandPaletteTenantSelect,
    onSelectQuickAction: handleCommandPaletteQuickActionSelect
  };

  return {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    goToNextSection,
    goToPreviousSection,
    isEmptyOwner: props.isEmpty && isOwnerRole,
    isManagerRole,
    isOwnerRole,
    isOwnerDailyOpsEnabled: ownerDailyOpsEnabled,
    isOwnerDailyOpsHomePage,
    layoutProps,
    commandPaletteProps,
    occupancy,
    ownerDailyOpsPage,
    ownerDailyOpsPageCountLabel,
    ownerDailyOpsPageLabel,
    ownerDailyOpsTotalPages,
    openPropertyWizard,
    closePropertyWizard,
    openLeaseWizard,
    closeLeaseWizard,
    openTenantInviteWizard,
    closeTenantInviteWizard,
    ownerOnboarding,
    ownerWorkflowMode,
    resolvedGamification,
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
      isOwnerRole && safePortfolio.properties.length > 0 && safePortfolio.units.length === 0 && Boolean(props.onInviteTenant)
  };
}
