import type { ReactNode } from "react";

export function LandingShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--ground)] text-[var(--ink)]">{children}</div>;
}
