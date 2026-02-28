"use client";

import { useFormState } from "react-dom";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface VendorOption {
  id: string;
  name: string;
}

interface TicketVendorControlProps {
  ticketId: string;
  vendors: VendorOption[];
  onAssignVendor: StatefulAction;
}

export function TicketVendorControl({
  ticketId,
  vendors,
  onAssignVendor
}: TicketVendorControlProps) {
  const [state, action] = useFormState(onAssignVendor, null);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Select name="vendorId" defaultValue="" className="h-8 w-36 text-xs" required>
        <option value="">Assign vendor</option>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </Select>
      <SubmitButton size="sm" variant="outline">
        Assign
      </SubmitButton>
      {state && !state.success && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
    </form>
  );
}
