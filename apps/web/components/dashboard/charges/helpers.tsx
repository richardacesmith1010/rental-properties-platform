"use client";

import type { ActionState } from "@/app/actions";
import type { StatefulAction } from "./types";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/format";
import type { ChargeRowData } from "../charge-row";

type Charge = ChargeRowData;

export const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "This action is unavailable."
});

export function InlineAlert({ state, defaultMessage }: { state: ActionState; defaultMessage: string }) {
  if (!state) return null;
  if (state.success) {
    return (
      <Alert variant="success" className="mb-3">
        {state.message ?? defaultMessage}
      </Alert>
    );
  }

  return (
    <Alert variant="error" className="mb-3">
      {state.error}
    </Alert>
  );
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function exportChargesCsv(charges: Charge[]) {
  const rows = [
    ["Tenant", "Property", "Unit", "Amount", "Due Date", "Status"],
    ...charges.map((charge) => [
      charge.tenantName ?? "",
      charge.propertyName ?? "",
      charge.unitNumber ?? "",
      formatCurrency(charge.amountCents),
      charge.dueDate,
      charge.status
    ])
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `charges-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

