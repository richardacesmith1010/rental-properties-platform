import type { ReactNode } from "react";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-white text-slate-700">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.3),transparent_28%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />
      {children}
    </div>
  );
}
