"use client";

import { useState } from "react";
import { Building2, Briefcase, Home, ArrowLeft } from "lucide-react";
import { LoginForm } from "./login-form";

const roles = [
  {
    id: "owner" as const,
    label: "Owner",
    description: "Manage properties, rent, and reports.",
    icon: Building2,
    nextPath: "/owner",
  },
  {
    id: "manager" as const,
    label: "Manager",
    description: "Manage assigned properties and tenant needs.",
    icon: Briefcase,
    nextPath: "/manager",
  },
  {
    id: "tenant" as const,
    label: "Tenant",
    description: "Pay rent, report problems, and view lease documents.",
    icon: Home,
    nextPath: "/tenant",
  },
];

export function RoleSelector() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  return (
    <div className="w-full max-w-3xl">
      <p className="mb-5 text-center text-sm text-muted-foreground">
        Choose your role to sign in or create an account.
      </p>
      {/* Role cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {roles.map((role) => {
          const Icon = role.icon;
          const isSelected = selectedRole === role.id;
          const isOther = selectedRole !== null && !isSelected;
          const isHovered = hoveredRole === role.id && !selectedRole;

          return (
            <div key={role.id} className="flex flex-col">
              {/* Clickable card */}
              <button
                type="button"
                onClick={() => setSelectedRole(isSelected ? null : role.id)}
                onMouseEnter={() => setHoveredRole(role.id)}
                onMouseLeave={() => setHoveredRole(null)}
                title={
                  isSelected
                    ? `Collapse ${role.label} login options.`
                    : `Select ${role.label} and open its login options.`
                }
                className={`
                  group relative flex flex-col items-center rounded-2xl border p-6 text-center shadow-[var(--domus-shadow-sm)]
                  transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]
                  ${isSelected
                    ? "scale-[1.02] border-[var(--accent-line)] bg-[var(--accent-weak)] shadow-[var(--domus-shadow-md)]"
                    : isOther
                      ? "pointer-events-none scale-95 border-[var(--line)] bg-[var(--surface)] opacity-40"
                      : "cursor-pointer border-[var(--line)] bg-[var(--surface)] hover:scale-[1.02] hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)] hover:shadow-[var(--domus-shadow-md)]"
                  }
                `}
              >
                {/* Icon container */}
                <div
                  className={`
                    mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300
                    ${isSelected || isHovered
                      ? "bg-[var(--accent)] text-white shadow-[var(--domus-shadow-sm)]"
                      : "bg-[var(--accent-weak)] text-[var(--accent)]"
                    }
                  `}
                >
                  <Icon
                    className={`
                      h-8 w-8 transition-all duration-300
                      ${isSelected || isHovered ? "text-white" : "text-[var(--accent)]"}
                      ${isHovered && !selectedRole ? "animate-[bounce_0.6s_ease-in-out]" : ""}
                    `}
                  />
                </div>

                {/* Label */}
                <h3 className="text-base font-bold text-foreground">{role.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
              </button>

              {/* Expanded login form */}
              <div
                className={`
                  overflow-hidden transition-all duration-300 ease-out
                  ${isSelected ? "mt-4 max-h-[400px] opacity-100" : "max-h-0 opacity-0"}
                `}
              >
                {isSelected && (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--domus-shadow-sm)]">
                    <LoginForm nextPath={role.nextPath} role={role.id} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Back button */}
      <div
        className={`
          mt-6 flex justify-center transition-all duration-300
          ${selectedRole ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}
        `}
      >
        <button
          type="button"
          onClick={() => setSelectedRole(null)}
          title="Return to role selection cards."
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Choose a different role
        </button>
      </div>
    </div>
  );
}
