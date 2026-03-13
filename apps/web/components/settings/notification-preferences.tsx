"use client";

import { useFormState } from "react-dom";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import type { NotificationPreference, NotificationPreferenceOption } from "@/lib/notification-preferences";

interface NotificationPreferencesProps {
  options: NotificationPreferenceOption[];
  preferences: NotificationPreference[];
  onUpdatePreference: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

export function NotificationPreferences({
  options,
  preferences,
  onUpdatePreference
}: NotificationPreferencesProps) {
  const preferenceByType = new Map(preferences.map((preference) => [preference.notificationType, preference]));

  return (
    <div className="space-y-3">
      {options.map((option) => {
        const preference = preferenceByType.get(option.type) ?? {
          notificationType: option.type,
          emailEnabled: true,
          inAppEnabled: true
        };
        return (
          <NotificationPreferenceRow
            key={option.type}
            option={option}
            preference={preference}
            onUpdatePreference={onUpdatePreference}
          />
        );
      })}
    </div>
  );
}

function NotificationPreferenceRow({
  option,
  preference,
  onUpdatePreference
}: {
  option: NotificationPreferenceOption;
  preference: NotificationPreference;
  onUpdatePreference: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useFormState(onUpdatePreference, null);

  return (
    <form action={formAction} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
      <input type="hidden" name="notificationType" value={option.type} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{option.label}</p>
          <p className="mt-1 text-xs text-zinc-500">{option.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="emailEnabled"
              defaultChecked={preference.emailEnabled}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
            />
            Email
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="inAppEnabled"
              defaultChecked={preference.inAppEnabled}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
            />
            In-App
          </label>
          <SubmitButton size="sm" variant="outline" title={`Save ${option.label} preferences.`}>
            Save
          </SubmitButton>
        </div>
      </div>
      {state && !state.success ? (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      ) : null}
      {state?.success && state.message ? (
        <p className="mt-3 text-sm text-emerald-600">{state.message}</p>
      ) : null}
    </form>
  );
}
