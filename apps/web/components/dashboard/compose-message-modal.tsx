"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "@/app/actions";
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

interface ComposeMessageModalProps {
  open: boolean;
  onClose: () => void;
  recipientName: string;
  recipientProfileId: string;
  propertyId: string;
  propertyName?: string;
  prefilledSubject?: string;
  onSend: StatefulAction;
}

export function ComposeMessageModal({
  open,
  onClose,
  recipientName,
  recipientProfileId,
  propertyId,
  propertyName,
  prefilledSubject,
  onSend
}: ComposeMessageModalProps) {
  const [state, action] = useFormState(onSend, null);
  const [subject, setSubject] = useState(prefilledSubject ?? `Message for ${recipientName}`);
  const [message, setMessage] = useState("");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (open) {
      submittedRef.current = false;
      setSubject(prefilledSubject ?? `Message for ${recipientName}`);
      setMessage("");
    }
  }, [open, prefilledSubject, recipientName]);

  useEffect(() => {
    if (open && submittedRef.current && state?.success) {
      submittedRef.current = false;
      onClose();
    }
  }, [open, onClose, state?.success]);

  if (!open) {
    return null;
  }

  return (
    <ModalOverlay open={open} onClose={onClose}>
      <Card className="mx-auto w-full max-w-xl border border-border/70 bg-background shadow-2xl">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-xl font-semibold text-foreground">
            Message to {recipientName}
          </CardTitle>
          {propertyName ? (
            <p className="text-sm text-muted-foreground">
              This message will be attached to the {propertyName} conversation.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <form
            action={action}
            className="space-y-4"
            onSubmit={() => {
              submittedRef.current = true;
            }}
          >
            <input type="hidden" name="recipientProfileId" value={recipientProfileId} />
            <input type="hidden" name="propertyId" value={propertyId} />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground" htmlFor="compose-message-subject">
                Subject
              </label>
              <Input
                id="compose-message-subject"
                name="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                maxLength={180}
                placeholder="Message subject"
                title="Set a subject for this tenant message."
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground" htmlFor="compose-message-body">
                Message
              </label>
              <Textarea
                id="compose-message-body"
                name="body"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                minLength={1}
                maxLength={4000}
                placeholder="Write your message..."
                className="min-h-[140px]"
                title="Write the message you want to send."
              />
            </div>

            {state && !state.success ? (
              <p className="text-sm text-red-600">{state.error ?? "Unable to send message."}</p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                title="Cancel this message."
              >
                Cancel
              </Button>
              <SubmitButton
                className="sm:min-w-[140px]"
                title={`Send this message to ${recipientName}.`}
              >
                Send Message
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </ModalOverlay>
  );
}
