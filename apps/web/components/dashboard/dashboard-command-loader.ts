import { useCallback, useMemo } from "react";
import { Bell, Building2, CreditCard, FileText, Receipt, UserPlus } from "lucide-react";
import { formatDate, formatUnitLabel } from "@/lib/format";
import type { GlobalSearchItem } from "./global-search";
import type {
  CommandPaletteProperty,
  CommandPaletteQuickAction,
  CommandPaletteSection,
  CommandPaletteTenant,
  CommandPaletteTransaction
} from "./command-palette";
import type { DashboardProps } from "./types";
import type { DashboardCollectionState, DashboardKpiState } from "./dashboard-kpi-loader";
import type { DashboardNavigationState } from "./dashboard-section-loaders";

export function useDashboardCommandState(
  props: DashboardProps,
  collections: DashboardCollectionState,
  kpis: DashboardKpiState,
  navigation: DashboardNavigationState
) {
  const { safeAuditLogs, safeDashboardData, safePortfolio } = collections;
  const {
    displayDashboardData,
    filteredPortfolio,
    filteredTickets,
    isManagerRole,
    isOwnerRole,
    selectProperty,
    selectedPropertyId
  } = kpis;
  const {
    allSectionItems,
    closeCommandPalette,
    isCommandPaletteOpen,
    openLeaseWizard,
    openPropertyWizard,
    openSection,
    openTenantInviteWizard
  } = navigation;

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
        label: formatUnitLabel(unit.unitNumber),
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
        description: `${ticket.propertyName}${ticket.unitNumber ? ` • ${formatUnitLabel(ticket.unitNumber)}` : ""}`,
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
    displayDashboardData.charges,
    filteredPortfolio.leases,
    filteredPortfolio.properties,
    filteredPortfolio.tenants,
    filteredPortfolio.units,
    filteredTickets,
    isManagerRole,
    isOwnerRole,
    props.activeAccountId,
    safeAuditLogs,
    selectedPropertyId
  ]);

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
        openPropertyWizard();
      }

      if (actionId === "create-lease") {
        openSection("leases");
        openLeaseWizard();
      }

      if (actionId === "new-tenant") {
        openTenantInviteWizard();
      }

      if (actionId === "open-notifications") {
        openSection("notifications");
      }

      closeCommandPalette();
    },
    [
      closeCommandPalette,
      isOwnerRole,
      openLeaseWizard,
      openPropertyWizard,
      openSection,
      openTenantInviteWizard
    ]
  );

  return {
    searchItems,
    commandPaletteProps: {
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
    }
  };
}

export type DashboardCommandState = ReturnType<typeof useDashboardCommandState>;
