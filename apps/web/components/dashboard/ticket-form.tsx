"use client";

import { type KeyboardEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { TenantUnit } from "@/lib/maintenance";
import { Alert } from "@/components/ui/alert";
import { PhotoUpload } from "@/components/dashboard/maintenance/photo-upload";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface TicketFormProps {
  units: TenantUnit[];
  onCreateTicket: StatefulAction;
  photoWorkflowEnabled?: boolean;
  photoWorkflowWarning?: string | null;
  viewerRole?: "owner" | "manager" | "tenant";
}

interface TicketDraft {
  unitId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
}

const TICKET_STEPS = ["Unit", "Summary", "Details", "Priority", "Review & Send"] as const;
const PRIORITY_HELP: Record<TicketDraft["priority"], string> = {
  low: "Minor inconvenience",
  medium: "Affecting daily use",
  high: "Significant disruption",
  urgent: "Safety or emergency issue"
};

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return <Alert variant="error">{state.error}</Alert>;
}

function FormSuccess({ state, message }: { state: ActionState; message?: string }) {
  if (!state || !state.success) return null;
  return <Alert variant="success">{message ?? state.message ?? "Maintenance request sent!"}</Alert>;
}

function StepPill({
  label,
  active,
  done
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const className = active
    ? "border-[var(--accent-line)] bg-[var(--accent-weak)] text-[var(--accent)]"
    : done
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-zinc-200 bg-zinc-50 text-zinc-500";
  return <div className={`rounded-md border px-2 py-2 text-xs ${className}`}>{label}</div>;
}

function onEnterNext(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  canAdvance: boolean,
  advance: () => void
) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!canAdvance) return;
  advance();
}

function buildTenantTicketTitle(description: string) {
  const summary = description.trim().split(/[.!?]/)[0] || "Reported problem";
  return summary.slice(0, 200);
}

export function TicketForm({
  units,
  onCreateTicket,
  photoWorkflowEnabled = true,
  photoWorkflowWarning = null,
  viewerRole = "tenant"
}: TicketFormProps) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(null);
  const [isSubmitting, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<TicketDraft>({
    unitId: units[0]?.id ?? "",
    title: "",
    description: "",
    priority: "medium"
  });

  const requiredComplete = Boolean(draft.unitId && draft.title && draft.description && draft.priority);
  const activeUnit = units.find((unit) => unit.id === draft.unitId) ?? units[0] ?? null;

  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.unitId);
    if (index === 1) return Boolean(draft.title);
    if (index === 2) return Boolean(draft.description);
    if (index === 3) return Boolean(draft.priority);
    return requiredComplete;
  };

  useEffect(() => {
    if (!draft.unitId && units[0]?.id) {
      setDraft((current) => ({ ...current, unitId: units[0]?.id ?? current.unitId }));
    }
  }, [draft.unitId, units]);

  useEffect(() => {
    if (!state?.success) return;
    setStep(0);
    setPhotoFiles([]);
    setDraft({
      unitId: units[0]?.id ?? "",
      title: "",
      description: "",
      priority: "medium"
    });
  }, [state, units]);

  const handleSubmit = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("unitId", draft.unitId);
      formData.append(
        "title",
        viewerRole === "tenant" ? buildTenantTicketTitle(draft.description) : draft.title
      );
      formData.append("description", draft.description);
      formData.append("priority", draft.priority);
      for (const file of photoFiles) {
        formData.append("photos", file);
      }

      const result = await onCreateTicket(null, formData);
      setState(result);
      if (result?.success) {
        router.refresh();
      }
    });
  };

  if (viewerRole === "tenant") {
    const canSubmit = Boolean(draft.unitId && draft.description.trim());

    return (
      <Card>
        <CardHeader>
          <CardTitle>Report a Problem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            Describe what&apos;s wrong and we&apos;ll notify your landlord right away.
          </p>

          <FormError state={state} />
          <FormSuccess
            state={state}
            message="Got it! Your landlord has been notified. We&apos;ll update you when there&apos;s progress."
          />

          {activeUnit ? (
            <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Reporting for <span className="font-semibold text-foreground">{activeUnit.propertyName}</span> · Unit {activeUnit.unitNumber}
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">What&apos;s the problem?</span>
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={5}
              placeholder="For example: The kitchen faucet is leaking under the sink."
              required
            />
          </label>

          {photoWorkflowEnabled ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Add a photo (optional)</p>
              <PhotoUpload
                selectedPhotos={photoFiles}
                onPhotosSelected={setPhotoFiles}
                disabled={isSubmitting}
              />
            </div>
          ) : photoWorkflowWarning ? (
            <Alert variant="warning">{photoWorkflowWarning}</Alert>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            title="Report this problem."
          >
            {isSubmitting ? "Reporting..." : "Report Problem"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your landlord will be notified immediately.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Maintenance Request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600">
          One field at a time. Press Enter or Next to continue.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TICKET_STEPS.map((label, index) => (
            <StepPill
              key={label}
              label={label}
              active={step === index}
              done={stepComplete(index)}
            />
          ))}
        </div>

        <FormError state={state} />
        <FormSuccess state={state} />

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 1: Select the unit with the issue.</p>
            <Select
              value={draft.unitId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, unitId: event.target.value }))
              }
              required
            >
              <option value="">Select unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.propertyName} &bull; Unit {unit.unitNumber}
                </option>
              ))}
            </Select>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 2: Enter a short issue summary.</p>
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              onKeyDown={(event) => onEnterNext(event, stepComplete(step), () => setStep(2))}
              placeholder="Brief summary (e.g. Leaky faucet)"
              required
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 3: Describe the issue in detail.</p>
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              placeholder="Describe the issue in detail..."
              required
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Step 4: Set priority level.</p>
            <Select
              value={draft.priority}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priority: event.target.value as TicketDraft["priority"]
                }))
              }
              required
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
              <p><span className="font-semibold text-zinc-800">Low:</span> {PRIORITY_HELP.low}</p>
              <p><span className="font-semibold text-zinc-800">Medium:</span> {PRIORITY_HELP.medium}</p>
              <p><span className="font-semibold text-zinc-800">High:</span> {PRIORITY_HELP.high}</p>
              <p><span className="font-semibold text-zinc-800">Urgent:</span> {PRIORITY_HELP.urgent}</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Final step: review and send the request.</p>
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <p>
                <span className="font-semibold">Unit:</span>{" "}
                {units.find((unit) => unit.id === draft.unitId)?.unitNumber ?? "Not set"}
              </p>
              <p>
                <span className="font-semibold">Summary:</span> {draft.title || "Not set"}
              </p>
              <p>
                <span className="font-semibold">Description:</span> {draft.description || "Not set"}
              </p>
              <p>
                <span className="font-semibold">Priority:</span>{" "}
                {draft.priority.charAt(0).toUpperCase() + draft.priority.slice(1)}
              </p>
            </div>
            {photoWorkflowEnabled ? (
              <PhotoUpload
                selectedPhotos={photoFiles}
                onPhotosSelected={setPhotoFiles}
                disabled={isSubmitting}
              />
            ) : photoWorkflowWarning ? (
              <Alert variant="warning">{photoWorkflowWarning}</Alert>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={!requiredComplete || isSubmitting}
              onClick={handleSubmit}
              title="Send this maintenance request."
            >
              {isSubmitting ? "Sending..." : "Send Request"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((current) => Math.max(current - 1, 0))}
            disabled={step === 0}
            title="Go back one step."
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={() => setStep((current) => Math.min(current + 1, TICKET_STEPS.length - 1))}
            disabled={step >= TICKET_STEPS.length - 1 || !stepComplete(step)}
            title="Complete this step and move to the next step."
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStep(0);
              setPhotoFiles([]);
              setDraft({
                unitId: units[0]?.id ?? "",
                title: "",
                description: "",
                priority: "medium"
              });
            }}
            title="Restart this maintenance request."
          >
            Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
