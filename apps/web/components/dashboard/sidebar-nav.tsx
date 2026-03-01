import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Wrench,
  Bell,
  UserPlus,
  Settings,
  Building2,
  FileText,
  FileSignature,
  BriefcaseBusiness,
  LogOut,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
}

interface SidebarNavProps {
  userEmail: string;
  occupancy: number;
  activeLeaseCount: number;
  role: string;
  showTesterLink?: boolean;
  onSignOut: (formData: FormData) => Promise<void>;
  items?: NavItem[];
  snapshot?: {
    label: string;
    value: string;
    note: string;
  };
}

const defaultNavItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "charges", label: "Charges", icon: Receipt },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ownership", label: "Ownership", icon: UserPlus },
  { id: "invitations", label: "Invitations", icon: UserPlus },
  { id: "documents", label: "Documents", icon: FileSignature },
  { id: "vendors", label: "Vendors", icon: BriefcaseBusiness },
  { id: "operations", label: "Operations", icon: Settings },
  { id: "portfolio", label: "Portfolio", icon: Building2 },
  { id: "leases", label: "Leases", icon: FileText },
];

export function SidebarNav({
  userEmail,
  occupancy,
  activeLeaseCount,
  role,
  showTesterLink = false,
  onSignOut,
  items,
  snapshot,
}: SidebarNavProps) {
  const navItems = items ?? defaultNavItems;
  const renderedNavItems = showTesterLink
    ? [...navItems, { id: "tester", label: "Tester", icon: FlaskConical, href: "/tester" }]
    : navItems;
  const summary = snapshot ?? {
    label: "Snapshot",
    value: `${occupancy}% occupied`,
    note: `${activeLeaseCount} active leases`
  };

  return (
    <aside className="gradient-sidebar hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-shrink-0 lg:flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 text-lg font-bold text-white shadow-lg shadow-indigo-950/25 backdrop-blur-sm">
          R
        </div>
        <div>
          <div className="text-base font-bold text-white">Domus</div>
          <div className="text-[11px] text-white/60">Property Management</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 pb-4">
        {renderedNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={item.href ?? `#${item.id}`}
              className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] text-white/60 transition-all hover:bg-white/15 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Snapshot panel */}
      <div className="mx-4 mb-3 rounded-xl border border-white/15 bg-white/10 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          {summary.label}
        </p>
        <p className="mt-1 text-xl font-extrabold text-white">{summary.value}</p>
        <p className="text-xs text-white/50">{summary.note}</p>
      </div>

      {/* User + Sign out */}
      <div className="border-t border-white/[0.12] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-semibold text-white">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{userEmail}</p>
            <p className="text-[11px] text-white/40 capitalize">{role}</p>
          </div>
        </div>
        <form action={onSignOut} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

/* Mobile top bar for small screens */
export function MobileTopBar({
  userEmail,
  role,
  showTesterLink = false,
  onSignOut,
}: Pick<SidebarNavProps, "userEmail" | "role" | "showTesterLink" | "onSignOut">) {
  return (
    <div className="gradient-sidebar flex items-center justify-between px-4 py-3 shadow-lg lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          R
        </div>
        <div>
          <span className="block text-sm font-bold text-white">Domus</span>
          <span className="block text-[10px] uppercase tracking-wide text-white/60">
            {role}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {showTesterLink && (
          <a
            href="/tester"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10"
          >
            Tester
          </a>
        )}
        <span className="max-w-[120px] truncate text-xs text-white/60">{userEmail}</span>
        <form action={onSignOut}>
          <button
            type="submit"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
