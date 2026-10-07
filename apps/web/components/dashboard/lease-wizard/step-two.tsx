import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { getEffectiveLeaseEndDate, type LeaseWizardDraft } from "../lease-wizard-support";

export function LeaseWizardStepTwo({
  draft,
  onDraftChange
}: {
  draft: LeaseWizardDraft;
  onDraftChange: (draft: LeaseWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Lease type</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.leaseType === "fixed_term" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, leaseType: "fixed_term" })}
            title="Create a fixed-term lease with a defined end date."
          >
            Fixed term
          </Button>
          <Button
            type="button"
            variant={draft.leaseType === "month_to_month" ? "default" : "outline"}
            onClick={() => onDraftChange({ ...draft, leaseType: "month_to_month" })}
            title="Create a month-to-month lease using a rolling annual anchor."
          >
            Month-to-month
          </Button>
        </div>
        {draft.leaseType === "month_to_month" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            For monthly leases, Domus sets an end date 12 months out. The lease still renews each month.
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-start-date">
            Start date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="lease-wizard-start-date"
              type="date"
              value={draft.startDate}
              onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })}
              className="pl-9"
              title="Choose the lease start date."
            />
          </div>
        </div>

        {draft.leaseType === "fixed_term" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-end-date">
              End date
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="lease-wizard-end-date"
                type="date"
                value={draft.endDate}
                onChange={(event) => onDraftChange({ ...draft, endDate: event.target.value })}
                className="pl-9"
                title="Choose the lease end date."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Month-to-month anchor</p>
            <p className="mt-1">
              Domus will store {draft.startDate
              ? formatDate(getEffectiveLeaseEndDate(draft)) : "an end date"} as the rolling billing anchor.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-rent">
            Monthly rent
          </label>
          <Input
            id="lease-wizard-rent"
            type="number"
            min="0"
            step="0.01"
            value={draft.monthlyRentDollars}
            onChange={(event) => onDraftChange({ ...draft, monthlyRentDollars: event.target.value })}
            placeholder="1850.00"
            title="Enter the monthly rent amount."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-deposit">
            Security deposit (optional)
          </label>
          <Input
            id="lease-wizard-deposit"
            type="number"
            min="0"
            step="0.01"
            value={draft.depositDollars}
            onChange={(event) => onDraftChange({ ...draft, depositDollars: event.target.value })}
            placeholder="0.00"
            title="Enter the security deposit amount if there is one."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-due-day">
            Due day of month
          </label>
          <Input
            id="lease-wizard-due-day"
            type="number"
            min="1"
            max="28"
            value={draft.dueDayOfMonth}
            onChange={(event) => onDraftChange({ ...draft, dueDayOfMonth: event.target.value })}
            title="Choose which day rent is due each month."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-grace-period">
            Grace period (days)
          </label>
          <Input
            id="lease-wizard-grace-period"
            type="number"
            min="0"
            max="30"
            value={draft.gracePeriodDays}
            onChange={(event) => onDraftChange({ ...draft, gracePeriodDays: event.target.value })}
            title="Set the grace period before late fees apply."
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="lease-wizard-late-fee">
            Late fee
          </label>
          <Input
            id="lease-wizard-late-fee"
            type="number"
            min="0"
            step="0.01"
            value={draft.lateFeeDollars}
            onChange={(event) => onDraftChange({ ...draft, lateFeeDollars: event.target.value })}
            placeholder="0.00"
            title="Set the flat late fee amount for missed rent."
          />
        </div>
      </div>
    </div>
  );
}

