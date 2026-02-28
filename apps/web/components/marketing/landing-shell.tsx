import type { ReactNode } from "react";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(129,140,248,0.2),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.18),transparent_35%),linear-gradient(to_bottom,#020617,#0b1120)]" />
      {children}
    </div>
  );
}
