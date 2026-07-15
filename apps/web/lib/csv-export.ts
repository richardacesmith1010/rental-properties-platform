import type { ExpenseCategoryMetric, MonthlyRentMetric } from "./analytics";

function downloadCSV(filename: string, headers: string[], rows: string[][]): void {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportChargesCSV(metrics: MonthlyRentMetric[]): void {
  const headers = ["Month", "Rent Due ($)", "Collected ($)", "Late ($)", "Collection Rate (%)"];
  const rows = metrics.map((metric) => [
    metric.month,
    (metric.dueCents / 100).toFixed(2),
    (metric.collectedCents / 100).toFixed(2),
    (metric.lateCents / 100).toFixed(2),
    metric.dueCents > 0 ? ((metric.collectedCents / metric.dueCents) * 100).toFixed(1) : "0.0"
  ]);

  downloadCSV(
    `domus-rent-collection-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    rows
  );
}

export function exportExpensesCSV(categories: ExpenseCategoryMetric[]): void {
  const headers = ["Category", "Total ($)"];
  const rows = categories.map((category) => [
    category.category.replace(/_/g, " "),
    (category.totalCents / 100).toFixed(2)
  ]);

  downloadCSV(`domus-expenses-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}
