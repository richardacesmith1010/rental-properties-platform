"use client";

import { useFormState } from "react-dom";
import { PauseCircle } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { formatNotificationsPausedLabel } from "@/lib/notification-preferences";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface NotificationPauseBannerProps {
  pausedUntil: string | null;
  onResume: StatefulAction;
}

export function NotificationPauseBanner({
  pausedUntil,
  onResume
}: NotificationPauseBannerProps) {
  const [state, action] = useFormState(onResume, null);
  const pausedLabel = formatNotificationsPausedLabel(pausedUntil);

  if (!pausedLabel) {
    return null;
  }

  return (
    <Alert
      variant="warning"
      className="mt-3 flex flex-col gap-3 rounded-2xl border-amber-300/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-950">
            Notifications paused {pausedLabel}
          </p>
          <p className="text-sm text-amber-900/80">
            Email delivery is paused. In-app notifications still appear normally.
          </p>
          {state && !state.success ? (
            <p className="text-sm text-red-700">{state.error}</p>
          ) : null}
        </div>
      </div>

      <form action={action} className="w-full sm:w-auto">
        <SubmitButton
          size="sm"
          variant="outline"
          className="w-full border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto"
          title="Resume email notifications immediately."
        >
          Resume now
        </SubmitButton>
      </form>
    </Alert>
  );
}
