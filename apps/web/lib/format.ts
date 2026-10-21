import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const DISPLAY_TIME_ZONE = "America/Denver";

export function isCalendarDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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
  year: "numeric",
  timeZone: "UTC"
});
const instantDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: DISPLAY_TIME_ZONE
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC"
});
const instantDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC"
});
const instantShortDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE
});

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});
const instantMonthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", timeZone: DISPLAY_TIME_ZONE
});
const monthNameFormatter = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const instantMonthNameFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long", timeZone: DISPLAY_TIME_ZONE
});

function formatterForValue(value: string | Date | null | undefined, calendar: Intl.DateTimeFormat,
  instant: Intl.DateTimeFormat): Intl.DateTimeFormat {
  return typeof value === "string" && isCalendarDateString(value) ? calendar : instant;
}

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
  return formatterForValue(value, dateFormatter, instantDateFormatter).format(parsed);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return formatterForValue(value, dateTimeFormatter, instantDateTimeFormatter).format(parsed);
}

export function formatShortDateTime(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return formatterForValue(value, shortDateTimeFormatter, instantShortDateTimeFormatter).format(parsed);
}

export function formatMonthDay(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return formatterForValue(value, monthDayFormatter, instantMonthDayFormatter).format(parsed);
}

export function formatMonthName(value: string | Date | null | undefined): string {
  const parsed = normalizeDate(value);
  if (!parsed) return typeof value === "string" ? value : "";
  return formatterForValue(value, monthNameFormatter, instantMonthNameFormatter).format(parsed);
}

export function formatUnitLabel(unitNumber: string | null | undefined): string {
  if (!unitNumber) {
    return "";
  }

  const trimmed = unitNumber.trim();
  if (!trimmed) {
    return "";
  }

  if (/^unit\s/i.test(trimmed)) {
    return trimmed;
  }

  return `Unit ${trimmed}`;
}

function inferPluralForm(singular: string) {
  const lower = singular.toLowerCase();
  if (
    lower.endsWith("y") &&
    singular.length > 1 &&
    !"aeiou".includes(lower.charAt(lower.length - 2))
  ) {
    return `${singular.slice(0, -1)}ies`;
  }

  return `${singular}s`;
}

export function pluralize(count: number, singular: string, plural = inferPluralForm(singular)): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
    return formatDateTime(value);
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

  return formatDate(value);
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
