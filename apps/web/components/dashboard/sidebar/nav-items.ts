import {
  Banknote,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  FileSignature,
  FileText,
  LayoutDashboard,
  Moon,
  Receipt,
  Settings,
  SunMedium,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { DomusTheme } from "@/lib/theme";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  href?: string;
  description?: string;
  clickHint?: string;
}

export const defaultNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "High-level property and lease snapshot.",
    clickHint: "open the dashboard summary"
  },
  {
    id: "charges",
    label: "Charges",
    icon: Receipt,
    description: "Rent charges and due-date tracking.",
    clickHint: "open billing charges"
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    description: "Recent payment history and status.",
    clickHint: "open payment records"
  },
  {
    id: "manager-payments",
    label: "Manager Payments",
    icon: Banknote,
    description: "Recurring manager fees, reimbursements, and invoices.",
    clickHint: "open manager payments"
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    description: "Maintenance tickets and progress.",
    clickHint: "open maintenance workflow"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "System alerts and unread activity.",
    clickHint: "open notifications"
  },
  {
    id: "ownership",
    label: "Ownership",
    icon: UserPlus,
    description: "LLC accounts and co-owner membership.",
    clickHint: "open ownership settings"
  },
  {
    id: "invitations",
    label: "Invitations",
    icon: UserPlus,
    description: "Tenant, manager, and owner invites.",
    clickHint: "open invitation tools"
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileSignature,
    description: "Lease packets and property file vault.",
    clickHint: "open document tools"
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: BriefcaseBusiness,
    description: "Vendor directory and assignment options.",
    clickHint: "open vendor management"
  },
  {
    id: "operations",
    label: "Operations",
    icon: Settings,
    description: "Create properties, units, and leases.",
    clickHint: "open operations forms"
  },
  {
    id: "portfolio",
    label: "Portfolio",
    icon: Building2,
    description: "Property list and property-level edits.",
    clickHint: "open portfolio list"
  },
  {
    id: "units",
    label: "Units",
    icon: Building2,
    description: "Unit inventory and rent defaults.",
    clickHint: "open unit management"
  },
  {
    id: "leases",
    label: "Leases",
    icon: FileText,
    description: "Lease terms and lease lifecycle.",
    clickHint: "open lease management"
  },
  {
    id: "tenants",
    label: "Tenants",
    icon: Users,
    description: "All tenants across your properties.",
    clickHint: "open tenant directory"
  }
];

export const tenantNavItems: NavItem[] = [
  {
    id: "overview",
    label: "Rent",
    icon: LayoutDashboard,
    href: "/tenant?section=overview",
    description: "Pay rent, review due dates, and see your next payment.",
    clickHint: "open rent"
  },
  {
    id: "maintenance",
    label: "Problems",
    icon: Wrench,
    href: "/tenant?section=maintenance",
    description: "Report issues in your home and track updates.",
    clickHint: "open problems"
  },
  {
    id: "documents",
    label: "Lease",
    icon: FileSignature,
    href: "/tenant?section=documents",
    description: "Open your lease packet and rental documents.",
    clickHint: "open lease"
  },
  {
    id: "notifications",
    label: "Messages",
    icon: Bell,
    href: "/tenant?section=notifications",
    description: "Read landlord updates and reply in one place.",
    clickHint: "open messages"
  }
];

export const themeOptions: Array<{ value: DomusTheme; label: string; icon: typeof SunMedium }> = [
  { value: "atlas-light", label: "Atlas", icon: SunMedium },
  { value: "noctis-neon", label: "Noctis", icon: Moon },
  { value: "imperium-night", label: "Imperium", icon: Moon }
];

export function getNavTitle(item: NavItem) {
  const description = item.description ?? `${item.label} section.`;
  const clickHint = item.clickHint ?? (item.href ? `open ${item.label}.` : `show the ${item.label} section.`);
  return `${description} Click to ${clickHint}`;
}

export function getDisplayName({
  nickname,
  fullName,
  userEmail
}: {
  nickname?: string | null;
  fullName?: string | null;
  userEmail: string;
}) {
  const trimmedNickname = nickname?.trim();
  if (trimmedNickname) {
    return trimmedNickname;
  }

  const firstName = fullName?.trim().split(/\s+/)[0];
  if (firstName) {
    return firstName;
  }

  return userEmail;
}

export function resolveNavItems(items: NavItem[] | undefined, navPreset: "default" | "tenant") {
  return items ?? (navPreset === "tenant" ? tenantNavItems : defaultNavItems);
}

export function injectReportsNavItem(navItems: NavItem[], reportsHref: string | null): NavItem[] {
  if (!reportsHref) {
    return navItems;
  }

  return [
    ...navItems,
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      href: reportsHref,
      description: "Financial reports and analytics.",
      clickHint: "open financial reports"
    }
  ];
}

export function navButtonClasses(isActive: boolean, mobile = false) {
  return [
    "flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] transition-all",
    mobile ? "justify-start" : "",
    isActive ? "sidebar-shell-button sidebar-shell-button-active" : "sidebar-shell-button"
  ].join(" ");
}
