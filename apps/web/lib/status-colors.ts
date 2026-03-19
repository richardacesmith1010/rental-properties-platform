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
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        dot: "bg-emerald-500"
      };
    case "warning":
      return {
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
        dot: "bg-amber-500"
      };
    case "danger":
      return {
        text: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
        dot: "bg-red-500"
      };
    case "neutral":
    default:
      return {
        text: "text-gray-600",
        bg: "bg-gray-50",
        border: "border-gray-200",
        dot: "bg-gray-400"
      };
  }
}

export function statusBadgeClasses(status: string): string {
  const { text, bg, border } = getStatusClasses(status);
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
    text,
    bg,
    border
  ].join(" ");
}
