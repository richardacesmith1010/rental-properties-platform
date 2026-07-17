"use client";

import { Fragment, useMemo, useState } from "react";
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
  getRowId?: (row: T, index: number) => string;
  renderExpandedContent?: (row: T) => React.ReactNode;
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
      className="domus-card block p-5 shadow-sm transition hover:border-[var(--accent-line)] hover:bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] hover:shadow-md"
      title={`Jump to the ${title} report.`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--accent-weak)] p-2 text-[var(--accent)]">
          <ResolvedIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Jump to section
          </p>
          <h2 className="mt-1 text-base font-medium text-[var(--ink)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          <span className="mt-3 inline-flex text-sm font-medium text-[var(--accent)]">
            View report
          </span>
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
  footer,
  getRowId,
  renderExpandedContent
}: ReportSectionProps<T>) {
  const initialSortKey = defaultSortKey ?? columns.find((column) => column.sortValue)?.key ?? columns[0]?.key;
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

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

  function toggleExpanded(row: T, index: number) {
    if (!renderExpandedContent) {
      return;
    }
    const rowId = getRowId?.(row, index) ?? `${id}-${index}`;
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  return (
    <section id={id} className="domus-card scroll-mt-24 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Report details
          </p>
          <h3 className="mt-1 text-[22px] font-[640] tracking-[-0.02em] text-[var(--ink)]">
            {title}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
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
        <div className="mt-6 overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="min-w-full divide-y divide-[var(--line)] text-sm">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] ${column.className ?? ""}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
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
              {sortedRows.map((row, index) => {
                const rowId = getRowId?.(row, index) ?? `${id}-${index}`;
                const expanded = expandedRowIds.has(rowId);
                return (
                  <Fragment key={rowId}>
                    <tr
                      className={`domus-table-row align-top ${renderExpandedContent ? "cursor-pointer" : ""}`}
                      onClick={() => toggleExpanded(row, index)}
                      title={renderExpandedContent ? `Expand ${title} details for this row.` : undefined}
                    >
                      {columns.map((column) => (
                        <td key={column.key} className={`px-3 py-2 text-[var(--ink-2)] ${column.className ?? ""}`}>
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expanded && renderExpandedContent ? (
                      <tr className="bg-muted/20">
                        <td colSpan={columns.length} className="px-3 py-4">
                          {renderExpandedContent(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      )}
    </section>
  );
}
