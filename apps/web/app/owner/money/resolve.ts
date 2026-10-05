export function resolveMoneySelection(
  propertyIds: string[],
  requestedProperty: string | undefined,
  requestedMonth: string | undefined,
  now: Date
) {
  const today = now.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const propertyId = propertyIds.includes(requestedProperty ?? "") ? requestedProperty! : propertyIds[0];
  const selectedMonth = requestedMonth === "year" ? "year"
    : /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? "") ? requestedMonth! : currentMonth;
  const [year, value] = selectedMonth === "year"
    ? [now.getUTCFullYear(), 1] : selectedMonth.split("-").map(Number);
  const from = new Date(Date.UTC(year, value - 1, 1)).toISOString().slice(0, 10);
  const to = selectedMonth === "year" ? `${year + 1}-01-01`
    : new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10);
  const alertToday = selectedMonth === "year" || selectedMonth === currentMonth
    ? today : new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  return { propertyId, selectedMonth, currentMonth, range: { from, to }, alertToday };
}
