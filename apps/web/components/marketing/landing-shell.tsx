import type { CSSProperties, ReactNode } from "react";

const marketingShellStyle = {
  "--marketing-page-bg": "#ffffff",
  "--marketing-section-alt": "#f8fafc",
  "--marketing-card": "#ffffff",
  "--marketing-card-soft": "#f8fafc",
  "--marketing-border": "#e2e8f0",
  "--marketing-heading": "#0f172a",
  "--marketing-body": "#334155",
  "--marketing-muted": "#64748b",
  "--marketing-accent": "#7c3aed"
} as CSSProperties;

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen bg-[color:var(--marketing-page-bg)] text-[color:var(--marketing-body)]"
      style={marketingShellStyle}
    >
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.3),transparent_28%),radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />
      {children}
    </div>
  );
}
