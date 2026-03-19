"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/actions";
import type { MaintenancePhotoDTO } from "@/lib/maintenance";
import { validateMaintenancePhotoSelection } from "@/lib/maintenance-photos";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/dashboard/maintenance/photo-upload";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface TicketPhotoUploadProps {
  ticketId: string;
  existingPhotos?: MaintenancePhotoDTO[];
  onUploadPhoto: StatefulAction;
}

export function TicketPhotoUpload({
  ticketId,
  existingPhotos = [],
  onUploadPhoto
}: TicketPhotoUploadProps) {
  const router = useRouter();
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [state, setState] = useState<ActionState>(null);
  const [isPending, startTransition] = useTransition();

  const hasPhotos = useMemo(() => selectedPhotos.length > 0, [selectedPhotos.length]);

  const handleSubmit = () => {
    const validationError = validateMaintenancePhotoSelection(selectedPhotos, existingPhotos.length);
    if (validationError) {
      setState({ success: false, error: validationError });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("ticketId", ticketId);
      for (const file of selectedPhotos) {
        formData.append("photos", file);
      }

      const result = await onUploadPhoto(null, formData);
      setState(result);
      if (result?.success) {
        setSelectedPhotos([]);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-background p-3 shadow-sm">
      <PhotoUpload
        selectedPhotos={selectedPhotos}
        existingPhotos={existingPhotos}
        onPhotosSelected={setSelectedPhotos}
        disabled={isPending}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {state && !state.success ? state.error : state?.message ?? "Attach follow-up or completion photos to this ticket."}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasPhotos || isPending}
          onClick={handleSubmit}
          title="Upload the selected maintenance photos."
        >
          {isPending ? "Uploading..." : "Upload Photos"}
        </Button>
      </div>
    </div>
  );
}
