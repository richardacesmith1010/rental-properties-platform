"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  BarChart3,
  CreditCard,
  Download,
  FileBarChart2,
  Landmark,
  Receipt,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type SortDirection = "asc" | "desc";
type ReportCardIcon = "bar-chart-3" | "receipt" | "file-bar-chart-2" | "wallet" | "landmark" | "credit-card";

export interface ReportColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

interface ReportSectionProps<T> {
  id: string;
  title: string;
  description: string;
  columns: ReportColumn<T>[];
  rows: T[];
  emptyTitle: string;
  emptyDescription: string;
  onExport: () => void;
  exportLabel?: string;
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  footer?: React.ReactNode;
}

export interface ReportCardProps {
  id: string;
  icon: ReportCardIcon;
  title: string;
  description: string;
}

export function ReportCard({ id, icon: Icon, title, description }: ReportCardProps) {
  const iconMap = {
    "bar-chart-3": BarChart3,
    receipt: Receipt,
    "file-bar-chart-2": FileBarChart2,
    wallet: Wallet,
    landmark: Landmark,
    "credit-card": CreditCard
  } as const;
  const ResolvedIcon = iconMap[Icon];

  return (
    <a
      href={`#${id}`}
      className="domus-card block p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"
      title={`Jump to the ${title} report.`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
          <ResolvedIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-medium text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
          <span className="mt-3 inline-flex text-sm font-medium text-violet-700">View report</span>
        </div>
      </div>
    </a>
  );
}

export function ReportSection<T>({
  id,
  title,
  description,
  columns,
  rows,
  emptyTitle,
  emptyDescription,
  onExport,
  exportLabel = "Export CSV",
  defaultSortKey,
  defaultSortDirection = "asc",
  footer
}: ReportSectionProps<T>) {
  const initialSortKey = defaultSortKey ?? columns.find((column) => column.sortValue)?.key ?? columns[0]?.key;
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const sortedRows = useMemo(() => {
    const column = columns.find((entry) => entry.key === sortKey);
    if (!column?.sortValue) {
      return rows;
    }

    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue?.(left) ?? "";
      const rightValue = column.sortValue?.(right) ?? "";
      if (leftValue < rightValue) {
        return -1 * multiplier;
      }
      if (leftValue > rightValue) {
        return 1 * multiplier;
      }
      return 0;
    });
  }, [columns, rows, sortDirection, sortKey]);

  function handleSort(column: ReportColumn<T>) {
    if (!column.sortValue) {
      return;
    }
    if (sortKey === column.key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column.key);
    setSortDirection("asc");
  }

  return (
      <section id={id} className="domus-card scroll-mt-24 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-zinc-900">{title}</h3>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onExport}
          title={`Export the ${title} data as CSV.`}
        >
          <Download className="mr-2 h-4 w-4" />
          {exportLabel}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Download} title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={`px-3 py-2 text-left font-semibold text-zinc-600 ${column.className ?? ""}`}>
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-zinc-900"
                        onClick={() => handleSort(column)}
                        title={`Sort ${title} by ${column.label}.`}
                      >
                        {column.label}
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedRows.map((row, index) => (
                <tr key={index} className="domus-table-row align-top">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-3 py-2 text-zinc-700 ${column.className ?? ""}`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      )}
    </section>
  );
}
