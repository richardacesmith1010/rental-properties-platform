import type { InvitationListItem } from "@/lib/invitations";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { MaintenanceTicket } from "@/lib/maintenance";
import {
  Banknote,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  History,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  UserPlus,
  Wrench
} from "lucide-react";
import type { NavItem } from "./sidebar-nav";

export type OwnerWorkflowMode =
  | "daily_ops"
  | "new_property"
  | "new_tenant"
  | "new_manager"
  | "records";

export type ManagerWorkflowMode =
  | "daily_ops"
  | "new_property"
  | "new_tenant"
  | "vendor_ops";

export const ownerWorkflowModeMeta: Record<
  OwnerWorkflowMode,
  { label: string; description: string; sections: string[] }
> = {
  daily_ops: {
    label: "Daily Operations Mode",
    description: "Daily owner runbook: revenue risk, payments, maintenance, and alerts.",
    sections: [
      "overview",
      "charges",
      "portfolio",
      "maintenance",
      "leases",
      "manager-payments",
      "members",
      "analytics"
    ]
  },
  new_property: {
    label: "New Property Mode",
    description: "One guided flow to create the property, units, lease, and first tenant invite.",
    sections: ["overview", "operations", "portfolio", "units", "leases", "charges"]
  },
  new_tenant: {
    label: "New Tenant Mode",
    description: "Focused flow for invitation, lease setup, signatures, and first billing visibility.",
    sections: [
      "overview",
      "leasing",
      "invitations",
      "applications",
      "operations",
      "leases",
      "documents",
      "charges",
      "inbox"
    ]
  },
  new_manager: {
    label: "New Manager Mode",
    description: "Focused flow to onboard a manager and verify maintenance/vendor operations.",
    sections: ["overview", "invitations", "vendors", "maintenance", "inbox"]
  },
  records: {
    label: "Records & Compliance Mode",
    description: "Document vault, ownership accounts, and property records.",
    sections: ["overview", "documents", "ownership", "portfolio", "units", "leases"]
  }
};

export const managerWorkflowModeMeta: Record<
  ManagerWorkflowMode,
  { label: string; description: string; sections: string[] }
> = {
  daily_ops: {
    label: "Daily Operations Mode",
    description: "Daily manager runbook: maintenance queue, charges, and alerts.",
    sections: [
      "overview",
      "maintenance",
      "charges",
      "notifications",
      "activity",
      "applications",
      "inbox",
      "automations",
      "expenses",
      "analytics",
      "payments"
    ]
  },
  new_property: {
    label: "New Property Mode",
    description: "Guide a property from address to lease readiness without bouncing between sections.",
    sections: ["overview", "operations", "portfolio", "units", "leases", "charges"]
  },
  new_tenant: {
    label: "New Tenant Mode",
    description: "Invite tenant, activate lease, and verify billing readiness.",
    sections: [
      "overview",
      "leasing",
      "invitations",
      "applications",
      "operations",
      "leases",
      "documents",
      "charges",
      "inbox"
    ]
  },
  vendor_ops: {
    label: "Vendor Operations Mode",
    description: "Manage vendors and maintenance execution with minimal distractions.",
    sections: ["overview", "vendors", "maintenance", "inbox", "automations"]
  }
};

interface BuildAllSectionItemsParams {
  chargeBadgeCount: number;
  maintenanceBadgeCount: number;
  inboxBadgeCount: number;
  notificationBadgeCount: number;
  hasAnalyticsSection: boolean;
  hasActivitySection: boolean;
  hasLeasingSection: boolean;
  hasApplicationsSection: boolean;
  hasManagerPaymentsSection: boolean;
  hasMembersSection: boolean;
  hasInboxSection: boolean;
  hasAutomationsSection: boolean;
  hasNotificationsSection: boolean;
  hasOwnershipSection: boolean;
  hasInvitationsSection: boolean;
  hasDocumentsSection: boolean;
  hasVendorsSection: boolean;
  hasExpensesSection: boolean;
}

export function buildAllSectionItems(params: BuildAllSectionItemsParams): NavItem[] {
  const items: NavItem[] = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      description: "A single summary view of occupancy, risk, and cashflow.",
      clickHint: "view your KPI overview"
    },
    {
      id: "charges",
      label: "Charges",
      icon: Receipt,
      badgeCount: params.chargeBadgeCount,
      description: "Upcoming and late charges.",
      clickHint: "open billing charges"
    },
    {
      id: "payments",
      label: "Payments",
      icon: CreditCard,
      description: "Recent payment activity.",
      clickHint: "open payment history"
    },
    {
      id: "maintenance",
      label: "Maintenance",
      icon: Wrench,
      badgeCount: params.maintenanceBadgeCount,
      description: "Ticket queue and assignment controls.",
      clickHint: "open maintenance tickets"
    }
  ];

  if (params.hasLeasingSection) {
    items.push({
      id: "leasing",
      label: "Leasing Hub",
      icon: Building2,
      description: "Step-by-step leasing progression from invitation to billing live.",
      clickHint: "open leasing workflow hub"
    });
  }

  if (params.hasApplicationsSection) {
    items.push({
      id: "applications",
      label: "Applications",
      icon: ClipboardList,
      description: "Review tenant applications, notes, and screening scores.",
      clickHint: "open application review pipeline"
    });
  }

  if (params.hasManagerPaymentsSection) {
    items.push({
      id: "manager-payments",
      label: "Manager Payments",
      icon: Banknote,
      description: "Recurring fees, reimbursements, and manager invoices.",
      clickHint: "open manager payments"
    });
  }

  if (params.hasMembersSection) {
    items.push({
      id: "members",
      label: "Members",
      icon: UserPlus,
      description: "LLC members, email invites, and distribution controls.",
      clickHint: "open LLC members"
    });
  }

  if (params.hasInboxSection) {
    items.push({
      id: "inbox",
      label: "Inbox",
      icon: Bell,
      badgeCount: params.inboxBadgeCount,
      description: "Central event timeline for operational communication.",
      clickHint: "open domus inbox"
    });
  }

  if (params.hasAutomationsSection) {
    items.push({
      id: "automations",
      label: "Domus Flows",
      icon: Settings,
      description: "Automation templates for recurring workflows.",
      clickHint: "open automation templates"
    });
  }

  if (params.hasNotificationsSection) {
    items.push({
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      badgeCount: params.notificationBadgeCount,
      description: "Unread and historical alerts.",
      clickHint: "open notification center"
    });
  }

  if (params.hasActivitySection) {
    items.push({
      id: "activity",
      label: "Activity",
      icon: History,
      description: "Recent operational changes across your portfolio.",
      clickHint: "open recent activity"
    });
  }

  if (params.hasOwnershipSection) {
    items.push({
      id: "ownership",
      label: "Ownership",
      icon: UserPlus,
      description: "Ownership accounts and co-owner controls.",
      clickHint: "open ownership controls"
    });
  }

  if (params.hasInvitationsSection) {
    items.push({
      id: "invitations",
      label: "Invitations",
      icon: UserPlus,
      description: "Invite tenants, managers, and owners.",
      clickHint: "open invitation tools"
    });
  }

  if (params.hasDocumentsSection) {
    items.push({
      id: "documents",
      label: "Documents",
      icon: FileSignature,
      description: "Templates, packets, and property file vault.",
      clickHint: "open document workflows"
    });
  }

  if (params.hasVendorsSection) {
    items.push({
      id: "vendors",
      label: "Vendors",
      icon: BriefcaseBusiness,
      description: "Preferred vendor records and assignment metadata.",
      clickHint: "open vendor management"
    });
  }

  if (params.hasExpensesSection) {
    items.push({
      id: "expenses",
      label: "Expenses",
      icon: CreditCard,
      description: "Expense tracking and monthly P&L.",
      clickHint: "open expense tracking"
    });
  }

  if (params.hasAnalyticsSection) {
    items.push({
      id: "analytics",
      label: "Analytics",
      icon: BarChart3,
      description: "Financial and occupancy analytics.",
      clickHint: "open analytics dashboard"
    });
  }

  items.push(
    {
      id: "operations",
      label: "Operations",
      icon: Settings,
      description: "Create new properties, units, and leases.",
      clickHint: "open operations forms"
    },
    {
      id: "portfolio",
      label: "Portfolio",
      icon: Building2,
      description: "Property list with edit and archive controls.",
      clickHint: "open property portfolio"
    },
    {
      id: "units",
      label: "Units",
      icon: Building2,
      description: "Unit-level configuration and pricing.",
      clickHint: "open unit list"
    },
    {
      id: "leases",
      label: "Leases",
      icon: FileText,
      description: "Lease records, edits, and archive actions.",
      clickHint: "open lease management"
    }
  );

  return items;
}

export function getOwnerModeNavItems(params?: {
  hasAnalyticsSection?: boolean;
  hasManagerPaymentsSection?: boolean;
  hasMembersSection?: boolean;
}): NavItem[] {
  const items: NavItem[] = [
    {
      id: "owner:daily_ops",
      label: "Daily Ops",
      icon: LayoutDashboard,
      description: "Revenue, maintenance, and alerts for daily management.",
      clickHint: "switch to owner daily operations mode"
    },
    {
      id: "owner:new_property",
      label: "New Property",
      icon: Building2,
      description: "Open the step-by-step property creation wizard.",
      clickHint: "open the new property wizard"
    },
    {
      id: "owner:new_tenant",
      label: "New Tenant",
      icon: UserPlus,
      description: "Open the step-by-step tenant invite wizard.",
      clickHint: "open the tenant invite wizard"
    },
    {
      id: "owner:new_manager",
      label: "New Manager",
      icon: BriefcaseBusiness,
      description: "Assign manager to property and verify vendor flow.",
      clickHint: "switch to owner new manager mode"
    },
    {
      id: "owner:records",
      label: "Records",
      icon: ShieldCheck,
      description: "Documents, ownership, and portfolio records.",
      clickHint: "switch to owner records mode"
    }
  ];

  if (params?.hasAnalyticsSection) {
    items.push({
      id: "analytics",
      label: "Analytics",
      icon: BarChart3,
      description: "Portfolio performance, collection, and maintenance trends.",
      clickHint: "open owner analytics"
    });
  }

  if (params?.hasManagerPaymentsSection) {
    items.push({
      id: "manager-payments",
      label: "Manager Payments",
      icon: Banknote,
      description: "Recurring manager fees, reimbursements, and invoices.",
      clickHint: "open manager payments"
    });
  }

  if (params?.hasMembersSection) {
    items.push({
      id: "members",
      label: "Members",
      icon: UserPlus,
      description: "Invite LLC members by email and manage splits.",
      clickHint: "open LLC members"
    });
  }

  return items;
}

export function getManagerModeNavItems(): NavItem[] {
  return [
    {
      id: "manager:daily_ops",
      label: "Daily Ops",
      icon: LayoutDashboard,
      description: "Daily queue for maintenance, charges, and alerts.",
      clickHint: "switch to manager daily operations mode"
    },
    {
      id: "manager:new_property",
      label: "New Property",
      icon: Building2,
      description: "Onboard property, units, and initial lease setup.",
      clickHint: "switch to manager new property mode"
    },
    {
      id: "manager:new_tenant",
      label: "New Tenant",
      icon: UserPlus,
      description: "Open the step-by-step tenant invite wizard.",
      clickHint: "open the tenant invite wizard"
    },
    {
      id: "manager:vendor_ops",
      label: "Vendor Ops",
      icon: BriefcaseBusiness,
      description: "Vendor-first maintenance execution flow.",
      clickHint: "switch to manager vendor operations mode"
    }
  ];
}

export function getOwnerWorkflowSteps(params: {
  isOwnerRole: boolean;
  ownerWorkflowMode: OwnerWorkflowMode;
  invitations?: InvitationListItem[];
  safeDocuments: OwnerDocumentsData;
  safePortfolio: { properties: unknown[]; units: unknown[]; leases: unknown[] };
  safeVendors: VendorDTO[];
  tickets?: MaintenanceTicket[];
  chargeCount: number;
}): Array<{ label: string; done: boolean }> {
  if (!params.isOwnerRole) {
    return [];
  }

  if (params.ownerWorkflowMode === "new_property") {
    return [
      {
        label: "Create property record",
        done: params.safePortfolio.properties.length > 0
      },
      {
        label: "Add at least one unit",
        done: params.safePortfolio.units.length > 0
      },
      {
        label: "Finalize first lease",
        done: params.safePortfolio.leases.length > 0
      }
    ];
  }

  if (params.ownerWorkflowMode === "new_tenant") {
    const tenantInvites =
      (params.invitations ?? []).filter((invitation) => invitation.role === "tenant").length > 0;
    const packetSent =
      params.safeDocuments.packets.filter(
        (packet) => packet.status === "sent" || packet.status === "signed"
      ).length > 0;

    return [
      {
        label: "Send tenant invitation",
        done: tenantInvites
      },
      {
        label: "Create active lease",
        done: params.safePortfolio.leases.length > 0
      },
      {
        label: "Send lease document packet",
        done: packetSent
      },
      {
        label: "Verify first charge",
        done: params.chargeCount > 0
      }
    ];
  }

  if (params.ownerWorkflowMode === "new_manager") {
    const managerInvites =
      (params.invitations ?? []).filter((invitation) => invitation.role === "manager").length > 0;

    return [
      {
        label: "Send manager invitation",
        done: managerInvites
      },
      {
        label: "Set up preferred vendor",
        done: params.safeVendors.length > 0
      },
      {
        label: "Review maintenance queue",
        done: (params.tickets ?? []).length > 0
      }
    ];
  }

  return [];
}
