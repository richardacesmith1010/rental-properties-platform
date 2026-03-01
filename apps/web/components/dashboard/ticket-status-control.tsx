"use client";

import { useFormState } from "react-dom";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface TicketStatusControlProps {
  ticketId: string;
  currentStatus: string;
  onUpdateStatus: StatefulAction;
}

export function TicketStatusControl({
  ticketId,
  currentStatus,
  onUpdateStatus,
}: TicketStatusControlProps) {
  const [state, action] = useFormState(onUpdateStatus, null);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Select name="status" defaultValue={currentStatus} className="h-8 w-32 text-xs">
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </Select>
      <SubmitButton size="sm" variant="outline" title="Save this updated ticket status.">
        Update
      </SubmitButton>
      {state && !state.success && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
    </form>
  );
}
