"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BellOff,
  BellRing,
  Clock3,
  Loader2,
  MailWarning,
  PauseCircle,
  PlayCircle
} from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  areNotificationEmailsPaused,
  formatNotificationsPausedLabel,
  resolveNotificationPauseUntil,
  type NotificationEmailPreferenceKey,
  type NotificationPreferenceOption,
  type NotificationPreferenceSettings
} from "@/lib/notification-preferences";
import { cn } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface NotificationPreferencesProps {
  options: NotificationPreferenceOption[];
  settings: NotificationPreferenceSettings;
  onUpdatePreferences: StatefulAction;
  onPauseNotifications: StatefulAction;
  onResumeNotifications: StatefulAction;
}

function PreferenceSwitch({
  checked,
  disabled,
  onToggle
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-primary/40 bg-primary/20"
          : "border-border bg-muted"
      )}
      title={checked ? "Disable this email type." : "Enable this email type."}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function NotificationPreferences({
  options,
  settings,
  onUpdatePreferences,
  onPauseNotifications,
  onResumeNotifications
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState(settings.preferences);
  const [pausedUntil, setPausedUntil] = useState(settings.pausedUntil);
  const [pendingPreferenceKey, setPendingPreferenceKey] =
    useState<NotificationEmailPreferenceKey | null>(null);
  const [pendingPauseAction, setPendingPauseAction] = useState<
    "pause" | "resume" | null
  >(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPreferences(settings.preferences);
    setPausedUntil(settings.pausedUntil);
  }, [settings.pausedUntil, settings.preferences]);

  const emailsPaused = areNotificationEmailsPaused(pausedUntil);
  const pausedLabel = formatNotificationsPausedLabel(pausedUntil);

  const runAction = (
    action: StatefulAction,
    formData: FormData,
    onSuccess: () => void,
    onRollback?: () => void
  ) => {
    startTransition(async () => {
      const result = await action(null, formData);
      if (result?.success) {
        setFeedback({
          tone: "success",
          message: result.message ?? "Notification settings updated."
        });
        onSuccess();
        return;
      }

      if (onRollback) {
        onRollback();
      }

      setFeedback({
        tone: "error",
        message:
          result?.error ?? "Unable to update notification settings right now."
      });
    });
  };

  const handleToggle = (
    preferenceKey: NotificationEmailPreferenceKey,
    enabled: boolean
  ) => {
    const previousPreferences = preferences;
    const nextPreferences = {
      ...preferences,
      [preferenceKey]: enabled
    };
    setPreferences(nextPreferences);
    setPendingPreferenceKey(preferenceKey);
    setFeedback(null);

    const formData = new FormData();
    formData.set("preferenceKey", preferenceKey);
    if (enabled) {
      formData.set("enabled", "true");
    }

    runAction(
      onUpdatePreferences,
      formData,
      () => {
        setPendingPreferenceKey(null);
      },
      () => {
        setPreferences(previousPreferences);
        setPendingPreferenceKey(null);
      }
    );
  };

  const handlePause = (duration: "24_hours" | "1_week" | "until_resumed") => {
    const previousPausedUntil = pausedUntil;
    setPendingPauseAction("pause");
    setPausedUntil(resolveNotificationPauseUntil(duration));
    setFeedback(null);

    const formData = new FormData();
    formData.set("duration", duration);

    runAction(
      onPauseNotifications,
      formData,
      () => {
        setPendingPauseAction(null);
      },
      () => {
        setPausedUntil(previousPausedUntil);
        setPendingPauseAction(null);
      }
    );
  };

  const handleResume = () => {
    const previousPausedUntil = pausedUntil;
    setPendingPauseAction("resume");
    setPausedUntil(null);
    setFeedback(null);

    runAction(
      onResumeNotifications,
      new FormData(),
      () => {
        setPendingPauseAction(null);
      },
      () => {
        setPausedUntil(previousPausedUntil);
        setPendingPauseAction(null);
      }
    );
  };

  return (
    <div className="space-y-4">
      {!settings.schemaReady ? (
        <Alert variant="warning" className="px-4 py-3 text-sm">
          This feature requires a database update before email controls can be saved.
        </Alert>
      ) : null}

      {feedback ? (
        <Alert
          variant={feedback.tone === "success" ? "success" : "error"}
          className="px-4 py-3 text-sm"
        >
          {feedback.message}
        </Alert>
      ) : null}

      <div className="space-y-3">
        {options.map((option) => {
          const enabled = preferences[option.key];
          const rowPending = isPending && pendingPreferenceKey === option.key;

          return (
            <div
              key={option.key}
              className="rounded-2xl border border-border/60 bg-card/70 px-4 py-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {enabled ? (
                      <BellRing className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <p className="text-sm font-semibold text-foreground">
                      {option.label}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {rowPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <PreferenceSwitch
                    checked={enabled}
                    disabled={!settings.schemaReady || rowPending}
                    onToggle={() => handleToggle(option.key, !enabled)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-amber-700" />
              <p className="text-sm font-semibold text-amber-900">
                Pause all notifications
              </p>
            </div>
            <p className="text-sm text-amber-900/80">
              Stop all email notifications temporarily. In-app notifications will still appear.
            </p>
            {emailsPaused && pausedLabel ? (
              <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
                <Clock3 className="h-4 w-4" />
                Notifications are paused {pausedLabel}.
              </p>
            ) : null}
          </div>
          {pendingPauseAction ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 bg-white/90 text-amber-900 hover:bg-amber-100"
            onClick={() => handlePause("24_hours")}
            disabled={!settings.schemaReady || pendingPauseAction !== null}
            title="Pause all email notifications for 24 hours."
          >
            Pause for 24 hours
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 bg-white/90 text-amber-900 hover:bg-amber-100"
            onClick={() => handlePause("1_week")}
            disabled={!settings.schemaReady || pendingPauseAction !== null}
            title="Pause all email notifications for one week."
          >
            Pause for 1 week
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 bg-white/90 text-amber-900 hover:bg-amber-100"
            onClick={() => handlePause("until_resumed")}
            disabled={!settings.schemaReady || pendingPauseAction !== null}
            title="Pause all email notifications until you resume them."
          >
            Pause until I resume
          </Button>
          {emailsPaused ? (
            <Button
              type="button"
              className="bg-amber-900 text-white hover:bg-amber-950"
              onClick={handleResume}
              disabled={!settings.schemaReady || pendingPauseAction !== null}
              title="Resume all email notifications immediately."
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Resume now
            </Button>
          ) : null}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-white/75 px-3 py-3 text-sm text-amber-900/80">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            Use pause when you are setting up sample leases or charges and want to suppress outbound email while keeping in-app alerts intact.
          </p>
        </div>
      </div>
    </div>
  );
}
