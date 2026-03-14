"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/app/actions";
import type { TenantUnit } from "@/lib/maintenance";
import { Alert } from "@/components/ui/alert";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface TicketFormProps {
  units: TenantUnit[];
  onCreateTicket: StatefulAction;
}

interface TicketDraft {
  unitId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
}

const TICKET_STEPS = ["Unit", "Summary", "Details", "Priority", "Review & Submit"] as const;
const PRIORITY_HELP: Record<TicketDraft["priority"], string> = {
  low: "Minor inconvenience",
  medium: "Affecting daily use",
  high: "Significant disruption",
  urgent: "Safety or emergency issue"
};

function FormError({ state }: { state: ActionState }) {
  if (!state || state.success) return null;
  return (
    <Alert variant="error">
      {state.error}
    </Alert>
  );
}

function FormSuccess({ state }: { state: ActionState }) {
  if (!state || !state.success) return null;
  return (
    <Alert variant="success">
      Maintenance request submitted!
    </Alert>
  );
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
    ? "border-violet-300 bg-violet-50 text-violet-700"
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

export function TicketForm({ units, onCreateTicket }: TicketFormProps) {
  const [state, action] = useFormState(onCreateTicket, null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<TicketDraft>({
    unitId: "",
    title: "",
    description: "",
    priority: "medium"
  });

  const requiredComplete = Boolean(draft.unitId && draft.title && draft.description && draft.priority);

  const stepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.unitId);
    if (index === 1) return Boolean(draft.title);
    if (index === 2) return Boolean(draft.description);
    if (index === 3) return Boolean(draft.priority);
    return requiredComplete;
  };

  useEffect(() => {
    if (!state?.success) return;
    setStep(0);
    setDraft({
      unitId: "",
      title: "",
      description: "",
      priority: "medium"
    });
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Maintenance Request</CardTitle>
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
            <p className="text-sm text-zinc-600">Final step: review and submit request.</p>
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
            <form className="space-y-3" action={action}>
              <input type="hidden" name="unitId" value={draft.unitId} />
              <input type="hidden" name="title" value={draft.title} />
              <input type="hidden" name="description" value={draft.description} />
              <input type="hidden" name="priority" value={draft.priority} />
              <SubmitButton
                className="w-full"
                disabled={!requiredComplete}
                title="Create this maintenance request."
              >
                Submit Request
              </SubmitButton>
            </form>
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
              setDraft({
                unitId: "",
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
