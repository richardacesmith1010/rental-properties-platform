"use client";

import { useState } from "react";
import { Building2, Briefcase, Home, ArrowLeft } from "lucide-react";
import { LoginForm } from "./login-form";

const roles = [
  {
    id: "owner" as const,
    label: "Owner",
    description: "Portfolio control, rent operations, and full reporting.",
    icon: Building2,
    nextPath: "/owner",
    gradient: "from-indigo-500 to-violet-500",
    glowColor: "ring-indigo-500/30 shadow-indigo-500/20",
    bgLight: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    id: "manager" as const,
    label: "Manager",
    description: "Property operations for assigned portfolios.",
    icon: Briefcase,
    nextPath: "/manager",
    gradient: "from-cyan-500 to-blue-500",
    glowColor: "ring-cyan-500/30 shadow-cyan-500/20",
    bgLight: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  {
    id: "tenant" as const,
    label: "Tenant",
    description: "Rent payments, maintenance requests, and documents.",
    icon: Home,
    nextPath: "/tenant",
    gradient: "from-amber-500 to-orange-500",
    glowColor: "ring-amber-500/30 shadow-amber-500/20",
    bgLight: "bg-amber-50",
    iconColor: "text-amber-600",
  },
];

export function RoleSelector() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  return (
    <div className="w-full max-w-3xl">
      <p className="mb-5 text-center text-sm text-zinc-500">
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
                  group relative flex flex-col items-center rounded-2xl border bg-white p-6 text-center
                  transition-all duration-300 ease-out
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                  ${isSelected
                    ? `ring-2 ${role.glowColor} shadow-lg border-transparent scale-[1.02]`
                    : isOther
                      ? "opacity-40 scale-95 border-zinc-100 pointer-events-none"
                      : `border-zinc-200 hover:border-transparent hover:ring-2 hover:${role.glowColor} hover:shadow-lg hover:scale-105 cursor-pointer`
                  }
                `}
              >
                {/* Icon container */}
                <div
                  className={`
                    mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300
                    ${isSelected || isHovered
                      ? `bg-gradient-to-br ${role.gradient} shadow-lg`
                      : `${role.bgLight}`
                    }
                  `}
                >
                  <Icon
                    className={`
                      h-8 w-8 transition-all duration-300
                      ${isSelected || isHovered ? "text-white" : role.iconColor}
                      ${isHovered && !selectedRole ? "animate-[bounce_0.6s_ease-in-out]" : ""}
                    `}
                  />
                </div>

                {/* Label */}
                <h3 className="text-base font-bold text-zinc-900">{role.label}</h3>
                <p className="mt-1 text-xs text-zinc-500">{role.description}</p>
              </button>

              {/* Expanded login form */}
              <div
                className={`
                  overflow-hidden transition-all duration-300 ease-out
                  ${isSelected ? "mt-4 max-h-[400px] opacity-100" : "max-h-0 opacity-0"}
                `}
              >
                {isSelected && (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
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
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Choose a different role
        </button>
      </div>
    </div>
  );
}
