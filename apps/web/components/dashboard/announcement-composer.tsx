"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import {
  formatAnnouncementPropertyLabel,
  type AnnouncementPropertyOption,
  type AnnouncementScope
} from "@/lib/announcements";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Textarea } from "@/components/ui/textarea";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

type RecipientCountAction = (
  scope: AnnouncementScope,
  propertyIds: string[]
) => Promise<number>;

interface AnnouncementComposerProps {
  open: boolean;
  onClose: () => void;
  properties: AnnouncementPropertyOption[];
  onCreateAnnouncement: StatefulAction;
  onGetEstimatedRecipientCount: RecipientCountAction;
}

export function AnnouncementComposer({
  open,
  onClose,
  properties,
  onCreateAnnouncement,
  onGetEstimatedRecipientCount
}: AnnouncementComposerProps) {
  const router = useRouter();
  const [state, action] = useFormState(onCreateAnnouncement, null);
  const [scope, setScope] = useState<AnnouncementScope>("all_administered");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [recipientCountError, setRecipientCountError] = useState<string | null>(null);
  const [recipientCountPending, setRecipientCountPending] = useState(false);
  const submittedRef = useRef(false);
  const requestIdRef = useRef(0);

  const hasProperties = properties.length > 0;
  const selectedPropertyIdSet = new Set(selectedPropertyIds);
  const canSubmit =
    hasProperties &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (scope === "all_administered" || selectedPropertyIds.length > 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    submittedRef.current = false;
    setScope("all_administered");
    setSelectedPropertyIds([]);
    setTitle("");
    setBody("");
    setRecipientCountError(null);
    setRecipientCount(null);
  }, [open]);

  useEffect(() => {
    if (!open || !submittedRef.current || !state?.success) {
      return;
    }

    submittedRef.current = false;
    toast.success(state.message ?? "Announcement sent.");
    onClose();
    router.refresh();
  }, [onClose, open, router, state]);

  useEffect(() => {
    if (!open || !hasProperties) {
      setRecipientCount(null);
      setRecipientCountPending(false);
      setRecipientCountError(null);
      return;
    }

    if (scope === "specific_properties" && selectedPropertyIds.length === 0) {
      setRecipientCount(null);
      setRecipientCountPending(false);
      setRecipientCountError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setRecipientCountPending(true);
    setRecipientCountError(null);

    void onGetEstimatedRecipientCount(scope, selectedPropertyIds)
      .then((count) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setRecipientCount(count);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setRecipientCount(null);
        setRecipientCountError("Unable to estimate how many tenants will receive this right now.");
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setRecipientCountPending(false);
        }
      });
  }, [hasProperties, onGetEstimatedRecipientCount, open, scope, selectedPropertyIds]);

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds((current) =>
      current.includes(propertyId)
        ? current.filter((value) => value !== propertyId)
        : [...current, propertyId]
    );
  };

  if (!open) {
    return null;
  }

  return (
    <ModalOverlay open={open} onClose={onClose}>
      <Card className="mx-auto w-full max-w-2xl border border-border/70 bg-background shadow-2xl">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">
                Send Announcement
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Send a building-wide update to all your tenants or only the properties you choose.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onClose}
              title="Close this announcement form."
              aria-label="Close this announcement form"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <form
            action={action}
            className="space-y-5"
            onSubmit={() => {
              submittedRef.current = true;
            }}
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">Send to</legend>
              <label className="flex items-start gap-3 rounded-2xl border border-border/60 px-4 py-3">
                <input
                  type="radio"
                  name="scope"
                  value="all_administered"
                  checked={scope === "all_administered"}
                  onChange={() => setScope("all_administered")}
                  className="mt-1 h-4 w-4"
                  title="Send this announcement to all your tenants."
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">All my tenants</span>
                  <span className="block text-sm text-muted-foreground">
                    Send this to every tenant in the properties you administer.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-border/60 px-4 py-3">
                <input
                  type="radio"
                  name="scope"
                  value="specific_properties"
                  checked={scope === "specific_properties"}
                  onChange={() => setScope("specific_properties")}
                  className="mt-1 h-4 w-4"
                  title="Pick which properties should receive this announcement."
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">Specific properties</span>
                  <span className="block text-sm text-muted-foreground">
                    Choose exactly which properties should receive this update.
                  </span>
                </span>
              </label>
            </fieldset>

            {scope === "specific_properties" ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-foreground">Properties</legend>
                {hasProperties ? (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-border/60 p-3">
                    {properties.map((property) => (
                      <label
                        key={property.id}
                        className="flex items-start gap-3 rounded-xl border border-transparent px-3 py-2 hover:border-border/60"
                      >
                        <input
                          type="checkbox"
                          name="propertyIds"
                          value={property.id}
                          checked={selectedPropertyIdSet.has(property.id)}
                          onChange={() => toggleProperty(property.id)}
                          className="mt-1 h-4 w-4"
                          title={`Include ${property.name} in this announcement.`}
                        />
                        <span className="text-sm text-foreground">
                          {formatAnnouncementPropertyLabel(property)}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    You do not have any properties available for announcements yet.
                  </p>
                )}
              </fieldset>
            ) : null}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground" htmlFor="announcement-title">
                Title
              </label>
              <Input
                id="announcement-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
                placeholder="Boil water advisory"
                title="Enter a short title tenants will see in the app and email."
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground" htmlFor="announcement-body">
                Message
              </label>
              <Textarea
                id="announcement-body"
                name="body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={5000}
                placeholder="Write the announcement you want tenants to receive."
                className="min-h-[180px]"
                title="Write the announcement message."
              />
            </div>

            <div className="rounded-2xl border border-border/60 px-4 py-3 text-sm">
              {recipientCountPending ? (
                <p className="text-muted-foreground">Checking how many tenants will receive this.</p>
              ) : recipientCountError ? (
                <p className="text-red-600">{recipientCountError}</p>
              ) : !hasProperties ? (
                <p className="text-muted-foreground">
                  You do not have any properties available for announcements yet.
                </p>
              ) : recipientCount == null ? (
                <p className="text-muted-foreground">
                  {scope === "specific_properties"
                    ? "Select at least one property to see how many tenants will receive this."
                    : "Add a title and message when you are ready to send this announcement."}
                </p>
              ) : (
                <p className="text-foreground">
                  Will be sent to {recipientCount} tenant{recipientCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            {submittedRef.current && state && !state.success ? (
              <p className="text-sm text-red-600">{state.error ?? "Unable to send this announcement."}</p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                title="Cancel this announcement."
              >
                Cancel
              </Button>
              <SubmitButton
                className="sm:min-w-[150px]"
                disabled={!canSubmit}
                title="Send this announcement to your selected tenants."
              >
                Send
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </ModalOverlay>
  );
}
