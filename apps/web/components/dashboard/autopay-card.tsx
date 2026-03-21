"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/shared/submit-button";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface EnrollmentView {
  id: string;
  last4: string;
  brand: string | null;
  paymentMethodType: string;
  enabled: boolean;
  retryCount: number;
}

interface AutopayCardProps {
  leaseId: string;
  propertyLabel: string;
  enrollment: EnrollmentView | null;
  onSetupAutopay: StatefulAction;
  onDisableAutopay: StatefulAction;
}

export function AutopayCard({
  leaseId,
  propertyLabel,
  enrollment,
  onSetupAutopay,
  onDisableAutopay
}: AutopayCardProps) {
  const router = useRouter();
  const [setupState, setupAction] = useFormState(onSetupAutopay, null);
  const [disableState, disableAction] = useFormState(onDisableAutopay, null);

  useEffect(() => {
    if (disableState?.success) {
      router.refresh();
    }
  }, [disableState, router]);

  const feedbackState = disableState && !disableState.success ? disableState : setupState;

  if (!enrollment) {
    return (
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Enable Autopay</p>
            <p className="mt-1 text-sm text-muted-foreground">{propertyLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically pay rent on the due date with your saved card.
            </p>
          </div>
          <form action={setupAction}>
            <input type="hidden" name="leaseId" value={leaseId} />
            <SubmitButton title="Save a card and enable automatic rent payments.">
              Enable Autopay
            </SubmitButton>
          </form>
        </div>
        {feedbackState && !feedbackState.success ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {feedbackState.error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!enrollment.enabled) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Autopay Paused</p>
            <p className="mt-1 text-sm text-muted-foreground">{propertyLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatic payment failed twice. Add an updated card to re-enable autopay.
            </p>
          </div>
          <form action={setupAction}>
            <input type="hidden" name="leaseId" value={leaseId} />
            <SubmitButton title="Update your card and re-enable autopay.">
              Re-enable Autopay
            </SubmitButton>
          </form>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Saved method: {enrollment.brand ? `${enrollment.brand.toUpperCase()} ` : ""}•••• {enrollment.last4}
        </p>
        {feedbackState && !feedbackState.success ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {feedbackState.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Autopay Active</p>
          <p className="mt-1 text-sm text-muted-foreground">{propertyLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {enrollment.brand ? `${enrollment.brand.toUpperCase()} ` : enrollment.paymentMethodType.toUpperCase()}•••• {enrollment.last4}
          </p>
          {enrollment.retryCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last payment attempt failed. We&apos;ll retry once your retry window opens.
            </p>
          ) : null}
        </div>
        <form action={disableAction}>
          <input type="hidden" name="enrollmentId" value={enrollment.id} />
          <SubmitButton variant="outline" title="Turn off automatic payments for this lease.">
            Disable
          </SubmitButton>
        </form>
      </div>
      {disableState && !disableState.success ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {disableState.error}
        </p>
      ) : null}
    </div>
  );
}
