import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Wrench,
  Settings,
  Building2,
  FileText,
  LogOut,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarNavProps {
  userEmail: string;
  occupancy: number;
  activeLeaseCount: number;
  role: string;
  onSignOut: (formData: FormData) => Promise<void>;
  items?: NavItem[];
}

const defaultNavItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "charges", label: "Charges", icon: Receipt },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "operations", label: "Operations", icon: Settings },
  { id: "portfolio", label: "Portfolio", icon: Building2 },
  { id: "leases", label: "Leases", icon: FileText },
];

export function SidebarNav({
  userEmail,
  occupancy,
  activeLeaseCount,
  role,
  onSignOut,
  items,
}: SidebarNavProps) {
  const navItems = items ?? defaultNavItems;
  return (
    <aside className="gradient-sidebar hidden lg:flex lg:w-[260px] lg:flex-col lg:flex-shrink-0 fixed inset-y-0 left-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 text-lg font-bold text-white backdrop-blur-sm">
          R
        </div>
        <div>
          <div className="text-base font-bold text-white">RentFlow</div>
          <div className="text-[11px] text-white/50">Property Management</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] text-white/50 transition-all hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Snapshot panel */}
      <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Snapshot
        </p>
        <p className="mt-1 text-xl font-extrabold text-white">{occupancy}% occupied</p>
        <p className="text-xs text-white/40">{activeLeaseCount} active leases</p>
      </div>

      {/* User + Sign out */}
      <div className="border-t border-white/[0.08] px-5 py-4">
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
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
  onSignOut,
}: Pick<SidebarNavProps, "userEmail" | "role" | "onSignOut">) {
  return (
    <div className="gradient-sidebar flex items-center justify-between px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
          R
        </div>
        <span className="text-sm font-bold text-white">RentFlow</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/60">{userEmail}</span>
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
