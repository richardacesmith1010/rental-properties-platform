"use client";

import { useFormState } from "react-dom";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TicketPhotoUploadProps {
  ticketId: string;
  onUploadPhoto: StatefulAction;
}

export function TicketPhotoUpload({
  ticketId,
  onUploadPhoto
}: TicketPhotoUploadProps) {
  const [state, action] = useFormState(onUploadPhoto, null);

  return (
    <form action={action} className="flex items-center gap-2" encType="multipart/form-data">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Input type="file" name="photo" accept="image/*" className="h-8 w-44 text-xs" required />
      <Input name="caption" placeholder="Caption" className="h-8 w-28 text-xs" />
      <SubmitButton size="sm" variant="outline" title="Upload this photo to the ticket history.">
        Upload
      </SubmitButton>
      {state && !state.success && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
      {state && state.success && (
        <span className="text-xs text-emerald-600">Uploaded.</span>
      )}
    </form>
  );
}
