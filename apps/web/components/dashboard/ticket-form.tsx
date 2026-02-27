"use client";

import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { TenantUnit } from "@/lib/maintenance";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface TicketFormProps {
  units: TenantUnit[];
  onCreateTicket: StatefulAction;
}

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
      {state.error}
    </p>
  );
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
      Maintenance request submitted!
    </p>
  );
}

export function TicketForm({ units, onCreateTicket }: TicketFormProps) {
  const [state, action] = useFormState(onCreateTicket, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Maintenance Request</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" action={action}>
          <FormError state={state} />
          <FormSuccess state={state} />
          <Select name="unitId" required>
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.propertyName} &bull; Unit {unit.unitNumber}
              </option>
            ))}
          </Select>
          <Input name="title" placeholder="Brief summary (e.g. Leaky faucet)" required />
          <Textarea
            name="description"
            placeholder="Describe the issue in detail..."
            rows={3}
            required
          />
          <Select name="priority" required>
            <option value="">Select priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <SubmitButton className="w-full">Submit Request</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
