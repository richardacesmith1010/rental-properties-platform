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
