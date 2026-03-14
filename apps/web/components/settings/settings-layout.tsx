"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Building2, CreditCard, Palette, Shield, User } from "lucide-react";
import { cn } from "@/lib/format";

type SettingsRole = "owner" | "manager" | "tenant";

interface SettingsSection {
  title: string;
  description?: string;
  content: ReactNode;
}

interface SettingsLayoutProps {
  role: SettingsRole;
  sections: Record<string, SettingsSection>;
}

interface SettingsNavItem {
  id: string;
  label: string;
  icon: typeof User;
  roles?: SettingsRole[];
}

const settingsNav: SettingsNavItem[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "payment", label: "Payment Methods", icon: CreditCard, roles: ["tenant"] },
  { id: "bank", label: "Bank Account", icon: Building2, roles: ["owner", "manager"] },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: Shield }
];

export function SettingsLayout({ role, sections }: SettingsLayoutProps) {
  const availableNav = useMemo(
    () =>
      settingsNav.filter((item) => {
        if (!item.roles) {
          return true;
        }
        return item.roles.includes(role);
      }),
    [role]
  );
  const [activeSection, setActiveSection] = useState(availableNav[0]?.id ?? "profile");

  useEffect(() => {
    if (!availableNav.some((item) => item.id === activeSection)) {
      setActiveSection(availableNav[0]?.id ?? "profile");
    }
  }, [activeSection, availableNav]);

  const currentSection = sections[activeSection];

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="hidden rounded-2xl border border-[var(--domus-card-border)] bg-[var(--domus-input-bg)] p-2 md:block">
          <nav aria-label="Settings navigation" className="space-y-1">
            {availableNav.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                  title={`Open ${item.label} settings.`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="md:hidden">
          <nav aria-label="Settings navigation" className="flex gap-2 overflow-x-auto pb-1">
            {availableNav.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-[var(--domus-card-border)] bg-[var(--domus-card-bg)] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                  title={`Open ${item.label} settings.`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <section
        key={activeSection}
        className="domus-card p-5 animate-in fade-in duration-200"
        aria-live="polite"
      >
        {currentSection ? (
          <div className="space-y-4">
            <header className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide domus-muted">
                {currentSection.title}
              </h2>
              {currentSection.description ? (
                <p className="text-sm domus-muted">{currentSection.description}</p>
              ) : null}
            </header>
            {currentSection.content}
          </div>
        ) : null}
      </section>
    </div>
  );
}
