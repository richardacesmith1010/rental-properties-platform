import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { DashboardData } from "@/lib/dashboard";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { PortfolioData } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { DashboardProps } from "./types";

const EMPTY_TICKETS: MaintenanceTicket[] = [];
const EMPTY_AUDIT_LOGS: AuditLogEntry[] = [];
const EMPTY_RENT_INCREASE_HISTORY: RentIncreaseEntry[] = [];

export function buildPropertyAddress(property: {
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

export function computeFilteredKpis(params: {
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

export function useDashboardCollections(props: DashboardProps) {
  const resolvedGamification = props.gamification ?? {
    totalXp: 0,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  };
  const safePortfolio = useMemo<PortfolioData>(
    () => props.portfolio ?? { properties: [], units: [], leases: [], tenants: [] },
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

  return {
    resolvedGamification,
    safePortfolio,
    safeDocuments,
    safeTickets,
    safeAuditLogs,
    safeRentIncreaseHistory,
    safeExpenses,
    safeAnalytics,
    safeCapabilities,
    safeDashboardData,
    safeOwnershipAccounts,
    activeOwnershipAccount,
    safeNotifications: props.notifications ?? [],
    safeInboxThreads: props.inboxThreads ?? [],
    safeAutomationTemplates: props.automationTemplates ?? [],
    safeAutomationRules: props.automationRules ?? [],
    safeListings: props.listings ?? [],
    safeApplications: props.applications ?? [],
    safeManagerPaymentConfigs: props.managerPaymentConfigs ?? [],
    safeManagerPayments: props.managerPayments ?? [],
    safeManagerPaymentManagers: props.managerPaymentManagers ?? [],
    safeVendors: props.vendors ?? []
  };
}

export function useDashboardKpiData(
  props: DashboardProps,
  params: ReturnType<typeof useDashboardCollections>
) {
  const {
    activeOwnershipAccount,
    safeAnalytics,
    safeDashboardData,
    safeExpenses,
    safePortfolio,
    safeTickets
  } = params;
  const sortedVendors = useMemo(
    () =>
      [...params.safeVendors].sort((left, right) => {
        if (left.preferred !== right.preferred) {
          return Number(right.preferred) - Number(left.preferred);
        }
        return left.name.localeCompare(right.name);
      }),
    [params.safeVendors]
  );
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
  const inboxBadgeCount = params.safeInboxThreads.length;
  const notificationBadgeCount = params.safeNotifications.filter((notification) => !notification.readAt).length;
  const hasNotificationsSection = Boolean(props.onMarkNotificationRead);
  const hasActivitySection = isOwnerRole || isManagerRole;
  const hasInboxSection = Boolean(props.onMarkNotificationRead);
  const hasAutomationsSection = isOwnerRole || isManagerRole;
  const hasOwnershipSection = Boolean(props.onCreateOwnershipAccount && props.onLinkPropertyToOwnershipAccount);
  const hasInvitationsSection = Boolean(props.onInviteTenant && props.onInviteManager && props.onResendInvite);
  const hasLeasingSection = Boolean(canManagePortfolio && hasInvitationsSection);
  const hasApplicationsSection = Boolean(canManagePortfolio && params.safeCapabilities.leasingPipelineEnabled);
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
  const hasManagerPaymentsSection = Boolean(isOwnerRole && params.safeManagerPaymentManagers.length > 0);
  const hasMembersSection = Boolean(
    isOwnerRole && params.safeCapabilities.ownershipEnabled && activeOwnershipAccount?.accountType === "llc"
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
  }, [propertyFilteringEnabled, props.initialPropertyId, safePortfolio.properties, selectedPropertyId]);

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
      tenants: safePortfolio.tenants.filter((tenant) => tenant.propertyIds.includes(selectedProperty.id))
    };
  }, [safePortfolio, selectedProperty]);
  const filteredTickets = useMemo(
    () => (selectedProperty ? safeTickets.filter((ticket) => ticket.propertyId === selectedProperty.id) : safeTickets),
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

    return safeExpenses.pnlByProperty.find((row) => row.propertyId === selectedProperty.id)?.netCents ?? 0;
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
    [filteredCharges, filteredPortfolio, filteredTickets, safeDashboardData.kpis, selectedPropertyNetCashFlowCents]
  );
  const displayDashboardData = useMemo<DashboardData>(
    () => ({ ...safeDashboardData, charges: filteredCharges, kpis: filteredKpis }),
    [filteredCharges, filteredKpis, safeDashboardData]
  );
  const occupancy =
    displayDashboardData.kpis.totalUnits > 0
      ? Math.round((displayDashboardData.kpis.occupiedUnits / displayDashboardData.kpis.totalUnits) * 100)
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
      openTickets: filteredTickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length
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
  }, [activeOwnershipAccount, displayDashboardData.kpis, filteredCharges, safeExpenses.expenses, selectedProperty]);
  return {
    sortedVendors,
    isOwnerRole,
    isManagerRole,
    canManagePortfolio,
    propertyFilteringEnabled,
    chargeBadgeCount,
    maintenanceBadgeCount,
    inboxBadgeCount,
    notificationBadgeCount,
    hasNotificationsSection,
    hasActivitySection,
    hasInboxSection,
    hasAutomationsSection,
    hasOwnershipSection,
    hasInvitationsSection,
    hasLeasingSection,
    hasApplicationsSection,
    hasDocumentsSection,
    hasVendorsSection,
    hasExpensesSection,
    hasManagerPaymentsSection,
    hasMembersSection,
    hasAnalyticsSection,
    selectedPropertyId,
    selectProperty,
    selectedProperty,
    filteredPortfolio,
    filteredTickets,
    displayDashboardData,
    occupancy,
    selectedPropertySummary,
    financialOverviewData
  };
}

export type DashboardCollectionState = ReturnType<typeof useDashboardCollections>;
export type DashboardKpiState = ReturnType<typeof useDashboardKpiData>;
