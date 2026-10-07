"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SubmitButton } from "../shared/submit-button";
import { LeaseCollectionSetting } from "./lease-collection-setting";
import { addDays, addYears } from "./lease-section-presentation";
import type { LeaseListItem } from "@/lib/portfolio";

type LeaseFormAction = (payload: FormData) => void | Promise<void>;

interface LeaseManagePanelProps {
  lease: LeaseListItem;
  updateAction: LeaseFormAction;
  renewAction: LeaseFormAction;
  terminateAction: LeaseFormAction;
  isActiveLease: boolean;
  activeRenewLeaseId: string | null;
  setActiveRenewLeaseId: Dispatch<SetStateAction<string | null>>;
  activeTerminateLeaseId: string | null;
  setActiveTerminateLeaseId: Dispatch<SetStateAction<string | null>>;
}

const fieldLabelClass = "block text-xs font-medium text-muted-foreground";

export function LeaseManagePanel({
  lease,
  updateAction,
  renewAction,
  terminateAction,
  isActiveLease,
  activeRenewLeaseId,
  setActiveRenewLeaseId,
  activeTerminateLeaseId,
  setActiveTerminateLeaseId
}: LeaseManagePanelProps) {
  return (
    <div className="mt-3 space-y-4">
      <form action={updateAction} className="grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="leaseId" value={lease.id} />
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-monthly-rent-${lease.id}`}>
            Monthly rent ($)
          </label>
          <Input
            id={`lease-monthly-rent-${lease.id}`}
            name="monthlyRentDollars"
            type="number"
            min={1}
            step="0.01"
            defaultValue={lease.monthlyRentCents / 100}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-deposit-${lease.id}`}>
            Deposit ($)
          </label>
          <Input
            id={`lease-deposit-${lease.id}`}
            name="depositDollars"
            type="number"
            min={0}
            step="0.01"
            defaultValue={lease.depositCents / 100}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-due-day-${lease.id}`}>
            Rent due day (1–28)
          </label>
          <Input
            id={`lease-due-day-${lease.id}`}
            name="dueDayOfMonth"
            type="number"
            min={1}
            max={28}
            defaultValue={lease.dueDayOfMonth}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-grace-period-${lease.id}`}>
            Days before rent is late (0–30)
          </label>
          <Input
            id={`lease-grace-period-${lease.id}`}
            name="gracePeriodDays"
            type="number"
            min={0}
            max={30}
            defaultValue={lease.gracePeriodDays}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-late-fee-${lease.id}`}>
            Late fee ($)
          </label>
          <Input
            id={`lease-late-fee-${lease.id}`}
            name="lateFeeDollars"
            type="number"
            min={0}
            step="0.01"
            defaultValue={lease.lateFeeCents / 100}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabelClass} htmlFor={`lease-end-date-${lease.id}`}>
            Lease end date
          </label>
          <Input
            id={`lease-end-date-${lease.id}`}
            name="endDate"
            type="date"
            defaultValue={lease.endDate}
            required
          />
        </div>
        <div className="sm:col-span-3">
          <LeaseCollectionSetting
            id={`lease-collects-outside-domus-${lease.id}`}
            name="collectsOutsideDomus"
            defaultChecked={lease.collectsOutsideDomus}
          />
        </div>
        <div className="sm:col-span-3">
          <SubmitButton size="sm" variant="outline" title="Save lease term updates for this tenant.">
            Save Lease Changes
          </SubmitButton>
        </div>
      </form>

      {isActiveLease ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-base font-medium text-foreground">Renew Lease</p>
              <Button
                type="button"
                size="sm"
                variant={activeRenewLeaseId === lease.id ? "default" : "outline"}
                onClick={() => setActiveRenewLeaseId((current) => (current === lease.id ? null : lease.id))}
                title="Open renewal fields for this lease."
              >
                {activeRenewLeaseId === lease.id ? "Hide" : "Renew"}
              </Button>
            </div>
            {activeRenewLeaseId === lease.id ? (
              <form action={renewAction} className="space-y-2">
                <input type="hidden" name="leaseId" value={lease.id} />
                <div className="space-y-1">
                  <label className={fieldLabelClass} htmlFor={`lease-new-start-date-${lease.id}`}>
                    New start date
                  </label>
                  <Input
                    id={`lease-new-start-date-${lease.id}`}
                    name="newStartDate"
                    type="date"
                    defaultValue={addDays(lease.endDate, 1)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelClass} htmlFor={`lease-new-end-date-${lease.id}`}>
                    New end date
                  </label>
                  <Input
                    id={`lease-new-end-date-${lease.id}`}
                    name="newEndDate"
                    type="date"
                    defaultValue={addYears(lease.endDate, 1)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelClass} htmlFor={`lease-new-monthly-rent-${lease.id}`}>
                    New monthly rent ($)
                  </label>
                  <Input
                    id={`lease-new-monthly-rent-${lease.id}`}
                    name="newMonthlyRentDollars"
                    type="number"
                    min={0.01}
                    step="0.01"
                    defaultValue={lease.monthlyRentCents / 100}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelClass} htmlFor={`lease-new-due-day-${lease.id}`}>
                    New rent due day (1–28)
                  </label>
                  <Input
                    id={`lease-new-due-day-${lease.id}`}
                    name="newDueDayOfMonth"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={lease.dueDayOfMonth}
                    required
                  />
                </div>
                <SubmitButton size="sm" title="Create the renewed lease and close the current one.">
                  Confirm Renewal
                </SubmitButton>
              </form>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--crit)] bg-[var(--crit-bg)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-base font-medium text-[var(--crit)]">End Lease</p>
              <Button
                type="button"
                size="sm"
                variant={activeTerminateLeaseId === lease.id ? "destructive" : "outline"}
                onClick={() => setActiveTerminateLeaseId((current) => (current === lease.id ? null : lease.id))}
                title="Open lease end controls."
              >
                {activeTerminateLeaseId === lease.id ? "Hide" : "End Lease"}
              </Button>
            </div>
            {activeTerminateLeaseId === lease.id ? (
              <form action={terminateAction} className="space-y-2">
                <input type="hidden" name="leaseId" value={lease.id} />
                <div className="space-y-1">
                  <label className={fieldLabelClass} htmlFor={`lease-termination-reason-${lease.id}`}>
                    Why is this lease ending?
                  </label>
                  <Textarea
                    id={`lease-termination-reason-${lease.id}`}
                    name="terminationReason"
                    rows={3}
                    placeholder="Add a note about why this lease is ending."
                    required
                  />
                </div>
                <SubmitButton
                  size="sm"
                  variant="destructive"
                  title="End this lease and mark the unit as no longer occupied."
                >
                  Confirm Lease End
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
