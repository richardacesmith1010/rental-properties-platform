"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageCircleMore, Sparkles, Bug, X } from "lucide-react";
import { toast } from "sonner";
import type { StatefulAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Textarea } from "@/components/ui/textarea";
import type { FeedbackType } from "@/lib/feedback";
import { cn } from "@/lib/format";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: StatefulAction;
  defaultEmail?: string;
}

const FEEDBACK_TYPES: Array<{
  value: FeedbackType;
  label: string;
  description: string;
  icon: typeof Bug;
}> = [
  { value: "bug", label: "Bug", description: "Something is broken", icon: Bug },
  { value: "feature", label: "Feature", description: "A feature request", icon: Sparkles },
  { value: "other", label: "Other", description: "Anything else", icon: MessageCircleMore }
];

export function FeedbackModal({ open, onClose, onSubmit, defaultEmail }: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [metadata, setMetadata] = useState({
    pageUrl: "",
    userAgent: "",
    viewport: ""
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFeedbackType("bug");
    setMessage("");
    setEmail(defaultEmail ?? "");
    setClientError(null);
    setMetadata({
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    });

    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [defaultEmail, open]);

  const selectedType = useMemo(
    () => FEEDBACK_TYPES.find((item) => item.value === feedbackType) ?? FEEDBACK_TYPES[0],
    [feedbackType]
  );

  if (!open) {
    return null;
  }

  const handleSubmit = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      setClientError("Please share at least 10 characters.");
      return;
    }

    setClientError(null);

    const formData = new FormData();
    formData.set("type", feedbackType);
    formData.set("message", trimmedMessage);
    formData.set("email", email.trim());
    formData.set("pageUrl", metadata.pageUrl || window.location.href);
    formData.set("userAgent", metadata.userAgent || navigator.userAgent);
    formData.set("viewport", metadata.viewport || `${window.innerWidth}x${window.innerHeight}`);

    startTransition(async () => {
      const result = await onSubmit(null, formData);
      if (!result?.success) {
        const errorMessage = result?.error ?? "Unable to send feedback right now.";
        setClientError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success(result.message ?? "Thanks! We got your feedback.");
      onClose();
    });
  };

  return (
    <ModalOverlay open={open} onClose={onClose}>
      <Card className="mx-auto w-full max-w-xl border border-border/70 bg-background shadow-2xl">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">Send Feedback</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your feedback goes directly to the Domus team.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 rounded-full"
              title="Close feedback form."
              aria-label="Close feedback form"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What type of feedback?</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {FEEDBACK_TYPES.map((option) => {
                const Icon = option.icon;
                const selected = option.value === feedbackType;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFeedbackType(option.value)}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      "min-h-11",
                      selected
                        ? "border-violet-500 bg-violet-50 text-violet-900 shadow-sm"
                        : "border-border/70 bg-card text-foreground hover:border-violet-300 hover:bg-muted/50"
                    )}
                    title={`Choose ${option.label.toLowerCase()} feedback.`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
              Tell us what happened
            </label>
            <Textarea
              ref={textareaRef}
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              minLength={10}
              maxLength={4000}
              placeholder={`Describe the ${selectedType.label.toLowerCase()}...`}
              className="min-h-[160px]"
              title="Describe the issue, request, or idea."
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Minimum 10 characters.</span>
              <span>{message.trim().length}/4000</span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="feedback-email" className="text-sm font-medium text-foreground">
              Email (optional)
            </label>
            <Input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              title="Share an email so the Domus team can follow up if needed."
            />
          </div>

          {clientError ? <p className="text-sm text-red-600">{clientError}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} title="Cancel feedback submission.">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="sm:min-w-[180px]"
              title="Send this feedback to the Domus team."
            >
              {isPending ? "Sending..." : "Send Feedback"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ModalOverlay>
  );
}
