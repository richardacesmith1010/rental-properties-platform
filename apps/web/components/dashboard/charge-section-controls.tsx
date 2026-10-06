import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";

export type ChargeFilter = "all" | "due_soon" | "pending" | "late" | "paid" | "waived";

export function ChargeSectionHeader({
  isTenantView,
  simpleRentView,
  showManualPayment,
  unpaidCount,
  canCreateCharge,
  onOpenManualPayment,
  onOpenCreateCharge,
  onGenerateChargesHref
}: {
  isTenantView: boolean;
  simpleRentView: boolean;
  showManualPayment: boolean;
  unpaidCount: number;
  canCreateCharge: boolean;
  onOpenManualPayment: () => void;
  onOpenCreateCharge: () => void;
  onGenerateChargesHref?: string;
}) {
  return (
    <CardHeader className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
      {!simpleRentView ? (
        <CardTitle className="text-xl font-semibold">
          {isTenantView ? "Rent" : "Rent"}
        </CardTitle>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {simpleRentView && showManualPayment ? (
          <Button type="button" size="sm" className="min-h-11 w-full sm:w-auto" onClick={onOpenManualPayment} disabled={unpaidCount === 0} title="Choose unpaid rent to mark as paid.">
            Mark rent as paid
          </Button>
        ) : null}
        {canCreateCharge ? (
          <Button type="button" size="sm" variant={simpleRentView ? "outline" : "default"} className="min-h-11 w-full sm:w-auto" onClick={onOpenCreateCharge} title="Add a one-time fee.">
            <Plus className="mr-2 h-4 w-4" />
            {simpleRentView ? "Add a one-time fee" : "Add rent"}
          </Button>
        ) : null}
        {onGenerateChargesHref && !simpleRentView ? (
          <Link
            href={onGenerateChargesHref}
            className={[
              "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--line)]",
              "bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors",
              "hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)] sm:w-auto"
            ].join(" ")}
            title="Generate rent payments for the current billing period."
          >
            Generate this month&apos;s rent
          </Link>
        ) : null}
      </div>
    </CardHeader>
  );
}

export function ChargeSectionFilters({
  simpleRentView,
  activeFilter,
  pendingCount,
  lateCount,
  paidThisMonthCount,
  onChange
}: {
  simpleRentView: boolean;
  activeFilter: ChargeFilter;
  pendingCount: number;
  lateCount: number;
  paidThisMonthCount: number;
  onChange: (filter: ChargeFilter) => void;
}) {
  const filters: Array<[ChargeFilter, string]> = simpleRentView
    ? [["late", `Late (${lateCount})`], ["due_soon", `Due soon (${pendingCount})`], ["paid", "Paid"], ["all", "All"]]
    : [["all", "All"], ["pending", "Pending"], ["late", "Late"], ["paid", "Paid"], ["waived", "Waived"]];

  return (
    <>
      {!simpleRentView ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2 text-sm shadow-sm">
          <span>{pendingCount} pending</span><span>{lateCount} late</span><span>{paidThisMonthCount} paid this month</span>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant="outline"
            className={activeFilter === value
              ? "min-h-11 border-primary/40 bg-primary/10 font-semibold text-primary shadow-sm"
              : "min-h-11 font-medium"}
            onClick={() => onChange(value)}
            title={`Show ${label.toLowerCase()} payments.`}
          >
            {label}
          </Button>
        ))}
      </div>
    </>
  );
}
