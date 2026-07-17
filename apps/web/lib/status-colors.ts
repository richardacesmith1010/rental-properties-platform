export type StatusCategory = "success" | "warning" | "danger" | "neutral";

const STATUS_MAP: Record<string, StatusCategory> = {
  paid: "success",
  collected: "success",
  completed: "success",
  complete: "success",
  active: "success",
  resolved: "success",
  approved: "success",
  pending: "warning",
  in_progress: "warning",
  upcoming: "warning",
  processing: "warning",
  submitted: "warning",
  open: "warning",
  late: "danger",
  overdue: "danger",
  urgent: "danger",
  expired: "danger",
  rejected: "danger",
  failed: "danger",
  terminated: "danger",
  cancelled: "neutral",
  waived: "neutral",
  inactive: "neutral",
  void: "neutral",
  draft: "neutral",
  renewed: "neutral",
  closed: "neutral"
};

export function getStatusCategory(status: string): StatusCategory {
  return STATUS_MAP[status.toLowerCase()] ?? "neutral";
}

export function statusAriaLabel(status: string, context?: string, labelOverride?: string): string {
  const normalizedLabel =
    labelOverride ??
    status
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  return context ? `${context}: ${normalizedLabel}` : `Status: ${normalizedLabel}`;
}

export function getStatusClasses(status: string): {
  text: string;
  bg: string;
  border: string;
  dot: string;
} {
  switch (getStatusCategory(status)) {
    case "success":
      return {
        text: "text-[var(--pos)]",
        bg: "bg-[var(--pos-bg)]",
        border: "border-[color:color-mix(in_srgb,var(--pos)_28%,var(--pos-bg))]",
        dot: "bg-[var(--pos)]"
      };
    case "warning":
      return {
        text: "text-[var(--warn)]",
        bg: "bg-[var(--warn-bg)]",
        border: "border-[color:color-mix(in_srgb,var(--warn)_28%,var(--warn-bg))]",
        dot: "bg-[var(--warn)]"
      };
    case "danger":
      return {
        text: "text-[var(--crit)]",
        bg: "bg-[var(--crit-bg)]",
        border: "border-[color:color-mix(in_srgb,var(--crit)_28%,var(--crit-bg))]",
        dot: "bg-[var(--crit)]"
      };
    case "neutral":
    default:
      return {
        text: "text-[var(--muted)]",
        bg: "bg-[color:color-mix(in_srgb,var(--surface-2)_72%,transparent)]",
        border: "border-[color:color-mix(in_srgb,var(--line)_76%,transparent)]",
        dot: "bg-[var(--muted)]"
      };
  }
}

export function statusBadgeClasses(status: string): string {
  const { text, bg, border } = getStatusClasses(status);
  return [
    "tabular-nums inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em]",
    text,
    bg,
    border
  ].join(" ");
}
