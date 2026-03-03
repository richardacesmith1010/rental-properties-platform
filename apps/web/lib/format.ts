import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const currencyFormatter = new Intl.NumberFormat("en-US", {
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

function normalizeDate(value: string | Date): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function formatDate(value: string | Date): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return dateFormatter.format(parsed);
}

export function formatDateTime(value: string | Date): string {
  const parsed = normalizeDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "";
  }
  return dateTimeFormatter.format(parsed);
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
