import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const currencyFormatterNoCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const currencyFormatterWithCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function normalizeDate(value: string | Date | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function formatCurrency(cents: number): string {
  const hasCents = cents % 100 !== 0;
  const formatter = hasCents ? currencyFormatterWithCents : currencyFormatterNoCents;
  return formatter.format(cents / 100);
}

export function formatDate(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return dateFormatter.format(parsed);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return dateTimeFormatter.format(parsed);
}

export function formatRelativeTime(
  value: string | Date | null | undefined,
  nowValue: string | Date = new Date()
): string {
  const parsed = normalizeDate(value);
  const now = normalizeDate(nowValue);

  if (!parsed) {
    return typeof value === "string" ? value : "";
  }

  if (!now) {
    return formatDateTime(parsed);
  }

  const diffMs = now.getTime() - parsed.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return diffSeconds >= 0 ? "just now" : "in a few seconds";
  }

  const diffMinutes = Math.floor(absSeconds / 60);
  if (diffMinutes < 60) {
    return diffSeconds >= 0
      ? `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`
      : `in ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffSeconds >= 0
      ? `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
      : `in ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return diffSeconds >= 0
      ? `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
      : `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(parsed);
}

export function getGeneratedMessage(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
