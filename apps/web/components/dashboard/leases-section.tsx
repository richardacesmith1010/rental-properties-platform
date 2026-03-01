"use client";

import { useFormState } from "react-dom";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LeaseListItem } from "@/lib/portfolio";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface LeasesSectionProps {
  leases: LeaseListItem[];
  showControls?: boolean;
  onUpdateLease?: StatefulAction;
  onDeleteLease?: StatefulAction;
}

const unavailableAction: StatefulAction = async () => ({
  success: false,
  error: "Lease actions are unavailable."
});

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state, message }: { state: ActionState; message: string }) {
  if (!state || !state.success) return null;
  return (
    <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      {message}
    </p>
  );
}

export function LeasesSection({
  leases,
  showControls = false,
  onUpdateLease,
  onDeleteLease
}: LeasesSectionProps) {
  const [updateState, updateAction] = useFormState(onUpdateLease ?? unavailableAction, null);
  const [deleteState, deleteAction] = useFormState(onDeleteLease ?? unavailableAction, null);

  return (
    <Card id="leases">
      <CardHeader>
        <CardTitle>Active Leases</CardTitle>
      </CardHeader>
      <CardContent>
        {showControls && (
          <>
            <FormError state={updateState} />
            <FormError state={deleteState} />
            <FormSuccess state={updateState} message="Lease updated." />
            <FormSuccess state={deleteState} message="Lease archived." />
          </>
        )}

        {leases.length === 0 ? (
          <EmptyState message="No leases created yet." />
        ) : (
          <div>
            {leases.map((lease, i) => (
              <DataRow key={lease.id} last={i === leases.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{lease.unitLabel}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{lease.tenantEmail}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Ends {lease.endDate}
                  </p>

                  {showControls && (
                    <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="leaseId" value={lease.id} />
                      <Input
                        name="monthlyRentDollars"
                        type="number"
                        min={1}
                        step="0.01"
                        defaultValue={lease.monthlyRentCents / 100}
                        required
                      />
                      <Input
                        name="depositDollars"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={lease.depositCents / 100}
                        required
                      />
                      <Input
                        name="dueDayOfMonth"
                        type="number"
                        min={1}
                        max={28}
                        defaultValue={lease.dueDayOfMonth}
                        required
                      />
                      <Input
                        name="endDate"
                        type="date"
                        defaultValue={lease.endDate}
                        required
                      />
                      <div className="sm:col-span-2">
                        <SubmitButton size="sm" variant="outline" title="Save lease term updates for this tenant.">
                          Save Lease Changes
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900">
                      {dollars(lease.monthlyRentCents)}
                    </p>
                    <p className="text-xs text-zinc-500">Due day {lease.dueDayOfMonth}</p>
                  </div>

                  {showControls && (
                    <form
                      action={deleteAction}
                      onSubmit={(event) => {
                        if (!window.confirm("Are you sure? This will archive the lease.")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="leaseId" value={lease.id} />
                      <Button type="submit" size="sm" variant="destructive" title="Archive this lease and free the unit.">
                        Archive
                      </Button>
                    </form>
                  )}
                </div>
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
